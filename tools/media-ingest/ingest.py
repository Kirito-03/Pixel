"""Core media ingest pipeline: local H.264 720p encode and verified rclone upload."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from manifest import DEFAULT_PROFILE, IngestManifest, profile_for_mode
from validators import (
    ValidationError,
    sanitize_text,
    validate_allowed_root,
    validate_input_file,
    validate_manifest_path,
    validate_mode,
    validate_output_file,
    validate_remote_target,
    validate_timeout,
)

CHUNK_SIZE = 1024 * 1024  # 1 MiB


class IngestError(RuntimeError):
    """Raised when encoding, uploading, or verification fails."""


@dataclass(frozen=True)
class ProbeResult:
    """Local ffprobe stream summary for auto/remux compatibility checks."""

    video_codec: str | None
    video_pix_fmt: str | None
    width: int | None
    height: int | None
    audio_codecs: tuple[str, ...]
    format_name: str | None
    is_remux_compatible: bool
    remux_reason: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize probe summary for manifests and dry-run/queue output."""
        return {
            "video_codec": self.video_codec,
            "video_pix_fmt": self.video_pix_fmt,
            "width": self.width,
            "height": self.height,
            "audio_codecs": list(self.audio_codecs),
            "format_name": self.format_name,
            "is_remux_compatible": self.is_remux_compatible,
            "remux_reason": self.remux_reason,
        }


@dataclass(frozen=True)
class IngestConfig:
    """Validated configuration for a single-file ingest run."""

    input_path: Path
    output_path: Path
    manifest_path: Path
    remote_target: str | None
    ffmpeg_bin: str
    rclone_bin: str
    ffmpeg_timeout: int
    rclone_timeout: int
    dry_run: bool
    mode: str = "encode"
    ffprobe_bin: str = "ffprobe"
    ffprobe_timeout: int = 60
    low_priority: bool = True


def compute_sha256(path: Path) -> tuple[str, int]:
    """Stream file in 1 MiB chunks and return (sha256_hex, size_bytes)."""
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
    return digest.hexdigest(), total


def build_ffprobe_command(
    input_path: Path,
    ffprobe_bin: str = "ffprobe",
) -> list[str]:
    """Build argument list for local ffprobe inspection without network protocols."""
    return [
        ffprobe_bin,
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt",
        "-show_entries",
        "format=format_name",
        "-of",
        "json",
        str(input_path),
    ]


def build_ffmpeg_command(
    input_path: Path,
    output_path: Path,
    ffmpeg_bin: str = "ffmpeg",
    *,
    mode: str = "encode",
) -> list[str]:
    """Build argument list for encode (720p CRF26 veryfast), remux, or experimental mediacodec."""
    base = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-n",
        "-protocol_whitelist",
        "file,pipe",
        "-threads",
        "2",
        "-i",
        str(input_path),
    ]
    if mode == "remux":
        return [
            *base,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ]

    scale_filter = (
        "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,"
        "pad=ceil(iw/2)*2:ceil(ih/2)*2"
    )
    if mode == "mediacodec":
        return [
            *base,
            "-threads",
            "2",
            "-filter_threads",
            "1",
            "-vf",
            scale_filter,
            "-c:v",
            "h264_mediacodec",
            "-b:v",
            "1800k",
            "-maxrate",
            "2500k",
            "-bufsize",
            "3600k",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]

    return [
        *base,
        "-threads",
        "2",
        "-filter_threads",
        "1",
        "-vf",
        scale_filter,
        "-c:v",
        "libx264",
        "-crf",
        "26",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]


def build_rclone_copyto_command(
    output_path: Path,
    remote_target: str,
    rclone_bin: str = "rclone",
) -> list[str]:
    """Build argument list for rclone copyto to an explicit private remote."""
    return [rclone_bin, "copyto", str(output_path), remote_target, "--immutable"]


def build_rclone_check_command(
    output_path: Path,
    remote_target: str,
    rclone_bin: str = "rclone",
) -> list[str]:
    """Build argument list for rclone check --one-way on the uploaded file."""
    remote_name, remote_path = remote_target.split(":", 1)
    if "/" in remote_path:
        remote_dir = f"{remote_name}:{remote_path.rsplit('/', 1)[0]}"
    else:
        remote_dir = f"{remote_name}:"
    return [
        rclone_bin,
        "check",
        "--one-way",
        str(output_path.parent),
        remote_dir,
        "--include",
        f"/{output_path.name}",
    ]


def _lower_process_priority() -> None:
    """Lower CPU scheduling priority for Termux/mobile background batches."""
    try:
        os.nice(10)
    except OSError:
        pass


def _run_subprocess(
    cmd: list[str],
    timeout: int,
    step_name: str,
    *,
    low_priority: bool = False,
) -> subprocess.CompletedProcess[str]:
    """Execute a subprocess without shell and enforce timeout and clean errors."""
    run_kwargs: dict[str, Any] = {
        "shell": False,
        "stdin": subprocess.DEVNULL,
        "capture_output": True,
        "text": True,
        "timeout": timeout,
        "check": False,
    }
    if low_priority and os.name == "posix":
        run_kwargs["preexec_fn"] = _lower_process_priority

    try:
        completed = subprocess.run(cmd, **run_kwargs)
    except subprocess.TimeoutExpired as exc:
        raise IngestError(
            f"{step_name} timed out after {timeout}s."
        ) from exc
    except FileNotFoundError as exc:
        raise IngestError(
            f"{step_name} binary not found: '{cmd[0]}'."
        ) from exc
    except OSError as exc:
        raise IngestError(
            f"{step_name} failed to start: {sanitize_text(str(exc))}"
        ) from exc

    if completed.returncode != 0:
        detail = sanitize_text((completed.stderr or completed.stdout or "").strip())
        if len(detail) > 500:
            detail = detail[:500] + "..."
        suffix = f": {detail}" if detail else ""
        raise IngestError(
            f"{step_name} exited with code {completed.returncode}{suffix}"
        )
    return completed


def probe_media(
    input_path: Path,
    ffprobe_bin: str = "ffprobe",
    timeout: int = 60,
    *,
    low_priority: bool = True,
) -> ProbeResult:
    """Inspect local media streams via ffprobe to determine remux compatibility."""
    cmd = build_ffprobe_command(input_path, ffprobe_bin)
    completed = _run_subprocess(cmd, timeout, "ffprobe", low_priority=low_priority)
    try:
        payload = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise IngestError(f"ffprobe returned invalid JSON: {sanitize_text(str(exc))}") from exc

    streams = payload.get("streams")
    if not isinstance(streams, list):
        raise IngestError("ffprobe output missing stream list.")

    video_streams = [s for s in streams if isinstance(s, dict) and s.get("codec_type") == "video"]
    audio_streams = [s for s in streams if isinstance(s, dict) and s.get("codec_type") == "audio"]
    if not video_streams:
        raise IngestError("ffprobe found no video stream in input file.")

    primary_video = video_streams[0]
    video_codec = primary_video.get("codec_name")
    video_pix_fmt = primary_video.get("pix_fmt")
    width = primary_video.get("width")
    height = primary_video.get("height")
    audio_codecs = tuple(
        str(s.get("codec_name")) for s in audio_streams if s.get("codec_name") is not None
    )
    fmt = payload.get("format")
    format_name = fmt.get("format_name") if isinstance(fmt, dict) else None

    if video_codec != "h264":
        compatible = False
        reason = f"video codec '{video_codec}' is not h264"
    elif video_pix_fmt != "yuv420p":
        compatible = False
        reason = f"video pix_fmt '{video_pix_fmt}' is not yuv420p"
    elif any(ac != "aac" for ac in audio_codecs):
        compatible = False
        reason = f"audio codecs {list(audio_codecs)} are not all aac"
    elif len(audio_streams) != len(audio_codecs):
        compatible = False
        reason = "audio stream missing codec_name"
    else:
        compatible = True
        reason = "h264 (yuv420p) + aac compatible for MP4 remux"

    return ProbeResult(
        video_codec=str(video_codec) if video_codec is not None else None,
        video_pix_fmt=str(video_pix_fmt) if video_pix_fmt is not None else None,
        width=int(width) if isinstance(width, int) else None,
        height=int(height) if isinstance(height, int) else None,
        audio_codecs=audio_codecs,
        format_name=str(format_name) if format_name is not None else None,
        is_remux_compatible=compatible,
        remux_reason=reason,
    )


def verify_mediacodec_available(
    ffmpeg_bin: str = "ffmpeg",
    timeout: int = 30,
    *,
    low_priority: bool = True,
) -> None:
    """Explicitly verify h264_mediacodec encoder availability before experimental use."""
    cmd = [ffmpeg_bin, "-hide_banner", "-encoders"]
    completed = _run_subprocess(cmd, timeout, "ffmpeg -encoders", low_priority=low_priority)
    if "h264_mediacodec" not in (completed.stdout or ""):
        raise IngestError(
            "Experimental MediaCodec mode requested, but 'h264_mediacodec' encoder is not available in this ffmpeg build."
        )


def validate_and_build_config(
    *,
    input_path: str,
    output_path: str,
    manifest_path: str,
    remote_target: str | None = None,
    allowed_root: str | None = None,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
    rclone_bin: str = "rclone",
    ffmpeg_timeout: int = 1800,
    ffprobe_timeout: int = 60,
    rclone_timeout: int = 1800,
    mode: str = "encode",
    low_priority: bool = True,
    dry_run: bool = False,
) -> IngestConfig:
    """Validate all parameters before any side effects occur."""
    validated_mode = validate_mode(mode)
    root_abs = validate_allowed_root(allowed_root) if allowed_root else None
    input_abs = validate_input_file(input_path, allowed_root=root_abs)
    output_abs = validate_output_file(output_path, input_abs, allowed_root=root_abs)
    manifest_abs = validate_manifest_path(
        manifest_path, input_abs, output_abs, allowed_root=root_abs
    )
    normalized_remote: str | None = None
    if remote_target is not None:
        _, normalized_remote = validate_remote_target(remote_target, output_abs)

    if not ffmpeg_bin or any(ch.isspace() for ch in ffmpeg_bin):
        raise ValidationError("ffmpeg_bin must be a valid executable name or path.")
    if not ffprobe_bin or any(ch.isspace() for ch in ffprobe_bin):
        raise ValidationError("ffprobe_bin must be a valid executable name or path.")
    if not rclone_bin or any(ch.isspace() for ch in rclone_bin):
        raise ValidationError("rclone_bin must be a valid executable name or path.")

    ff_to = validate_timeout(ffmpeg_timeout, "ffmpeg_timeout")
    fp_to = validate_timeout(ffprobe_timeout, "ffprobe_timeout")
    rc_to = validate_timeout(rclone_timeout, "rclone_timeout")

    return IngestConfig(
        input_path=input_abs,
        output_path=output_abs,
        manifest_path=manifest_abs,
        remote_target=normalized_remote,
        ffmpeg_bin=ffmpeg_bin,
        rclone_bin=rclone_bin,
        ffmpeg_timeout=ff_to,
        rclone_timeout=rc_to,
        dry_run=dry_run,
        mode=validated_mode,
        ffprobe_bin=ffprobe_bin,
        ffprobe_timeout=fp_to,
        low_priority=low_priority,
    )


def build_dry_run_plan(cfg: IngestConfig) -> dict[str, Any]:
    """Build a non-executing inspection plan for --dry-run."""
    commands: dict[str, list[str]] = {}
    if cfg.mode == "auto":
        commands["ffprobe"] = build_ffprobe_command(cfg.input_path, cfg.ffprobe_bin)
        commands["ffmpeg_if_remux"] = build_ffmpeg_command(
            cfg.input_path, cfg.output_path, cfg.ffmpeg_bin, mode="remux"
        )
        commands["ffmpeg_if_encode"] = build_ffmpeg_command(
            cfg.input_path, cfg.output_path, cfg.ffmpeg_bin, mode="encode"
        )
    elif cfg.mode == "remux":
        commands["ffprobe"] = build_ffprobe_command(cfg.input_path, cfg.ffprobe_bin)
        commands["ffmpeg"] = build_ffmpeg_command(
            cfg.input_path, cfg.output_path, cfg.ffmpeg_bin, mode="remux"
        )
    elif cfg.mode == "mediacodec":
        commands["ffmpeg_verify_encoders"] = [cfg.ffmpeg_bin, "-hide_banner", "-encoders"]
        commands["ffmpeg"] = build_ffmpeg_command(
            cfg.input_path, cfg.output_path, cfg.ffmpeg_bin, mode="mediacodec"
        )
    else:
        commands["ffmpeg"] = build_ffmpeg_command(
            cfg.input_path, cfg.output_path, cfg.ffmpeg_bin, mode="encode"
        )

    if cfg.remote_target is not None:
        commands["rclone_copyto"] = build_rclone_copyto_command(
            cfg.output_path, cfg.remote_target, cfg.rclone_bin
        )
        commands["rclone_check"] = build_rclone_check_command(
            cfg.output_path, cfg.remote_target, cfg.rclone_bin
        )
    return {
        "dry_run": True,
        "mode": cfg.mode,
        "input": str(cfg.input_path),
        "output": str(cfg.output_path),
        "manifest": str(cfg.manifest_path),
        "remote": cfg.remote_target,
        "profile": profile_for_mode(
            "encode" if cfg.mode == "auto" else cfg.mode,
            low_priority=cfg.low_priority,
        ),
        "timeouts": {
            "ffprobe_seconds": cfg.ffprobe_timeout,
            "ffmpeg_seconds": cfg.ffmpeg_timeout,
            "rclone_seconds": cfg.rclone_timeout,
        },
        "commands": commands,
    }


def upload_and_verify_output(
    *,
    output_path: Path,
    remote_target: str,
    rclone_bin: str,
    rclone_timeout: int,
    manifest: IngestManifest,
    manifest_path: Path,
    low_priority: bool = True,
) -> None:
    """Upload encoded MP4 via rclone copyto and verify with rclone check --one-way."""
    manifest.transition("uploading")
    manifest.save_atomic(manifest_path)
    copy_cmd = build_rclone_copyto_command(output_path, remote_target, rclone_bin)
    _run_subprocess(copy_cmd, rclone_timeout, "rclone copyto", low_priority=low_priority)

    manifest.transition("verifying")
    manifest.save_atomic(manifest_path)
    check_cmd = build_rclone_check_command(output_path, remote_target, rclone_bin)
    _run_subprocess(check_cmd, rclone_timeout, "rclone check", low_priority=low_priority)

    manifest.remote_verified = True
    manifest.transition("ready")
    manifest.save_atomic(manifest_path)


def _resolve_mode_for_run(cfg: IngestConfig) -> tuple[str, ProbeResult | None]:
    """Resolve effective processing mode (auto/remux/encode/mediacodec) via local checks."""
    if cfg.mode == "encode":
        return "encode", None
    if cfg.mode == "mediacodec":
        verify_mediacodec_available(
            cfg.ffmpeg_bin, timeout=min(cfg.ffprobe_timeout, 60), low_priority=cfg.low_priority
        )
        return "mediacodec", None

    probe = probe_media(
        cfg.input_path,
        ffprobe_bin=cfg.ffprobe_bin,
        timeout=cfg.ffprobe_timeout,
        low_priority=cfg.low_priority,
    )
    if cfg.mode == "remux":
        if not probe.is_remux_compatible:
            raise IngestError(
                f"Remux mode rejected because input is not H.264 (yuv420p) + AAC compatible: {probe.remux_reason}"
            )
        return "remux", probe

    # cfg.mode == "auto"
    applied = "remux" if probe.is_remux_compatible else "encode"
    return applied, probe


def run_ingest(cfg: IngestConfig) -> dict[str, Any]:
    """Execute the single-file ingest pipeline or return dry-run plan."""
    if cfg.dry_run:
        return build_dry_run_plan(cfg)

    source_sha256, source_size = compute_sha256(cfg.input_path)
    manifest = IngestManifest(
        source_path=str(cfg.input_path),
        source_size_bytes=source_size,
        source_sha256=source_sha256,
        output_path=str(cfg.output_path),
        remote_target=cfg.remote_target,
        mode_requested=cfg.mode,
        profile=profile_for_mode(
            "encode" if cfg.mode == "auto" else cfg.mode,
            low_priority=cfg.low_priority,
        ),
        status="queued",
    )
    manifest.save_atomic(cfg.manifest_path)

    try:
        applied_mode, probe = _resolve_mode_for_run(cfg)
        manifest.mode_applied = applied_mode
        manifest.probe = probe.to_dict() if probe is not None else None
        manifest.profile = profile_for_mode(applied_mode, low_priority=cfg.low_priority)

        manifest.transition("encoding")
        manifest.save_atomic(cfg.manifest_path)

        ffmpeg_cmd = build_ffmpeg_command(
            cfg.input_path, cfg.output_path, cfg.ffmpeg_bin, mode=applied_mode
        )
        _run_subprocess(
            ffmpeg_cmd, cfg.ffmpeg_timeout, "ffmpeg", low_priority=cfg.low_priority
        )

        if cfg.output_path.is_symlink():
            raise IngestError("Encoded output became a symlink unexpectedly.")
        if not cfg.output_path.exists() or not cfg.output_path.is_file():
            raise IngestError("ffmpeg finished without producing the output file.")
        if cfg.output_path.stat().st_size <= 0:
            raise IngestError("ffmpeg produced an empty output file.")

        output_sha256, output_size = compute_sha256(cfg.output_path)
        manifest.output_sha256 = output_sha256
        manifest.output_size_bytes = output_size
        manifest.transition("encoded")
        manifest.save_atomic(cfg.manifest_path)

        if cfg.remote_target is not None:
            upload_and_verify_output(
                output_path=cfg.output_path,
                remote_target=cfg.remote_target,
                rclone_bin=cfg.rclone_bin,
                rclone_timeout=cfg.rclone_timeout,
                manifest=manifest,
                manifest_path=cfg.manifest_path,
                low_priority=cfg.low_priority,
            )

        return manifest.to_dict()

    except Exception as exc:
        manifest.transition("error", error_message=sanitize_text(str(exc)))
        manifest.save_atomic(cfg.manifest_path)
        if isinstance(exc, IngestError):
            raise
        raise IngestError(sanitize_text(str(exc))) from exc
