"""Persistent atomic JSON manifest for media ingest jobs."""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MANIFEST_SCHEMA = "pixel.media_ingest.v1"

VALID_STATES = (
    "queued",
    "encoding",
    "encoded",
    "uploading",
    "verifying",
    "ready",
    "error",
)

DEFAULT_PROFILE: dict[str, Any] = {
    "container": "mp4", "video_codec": "av1", "encoder": "libsvtav1",
    "preserve_resolution": True, "preserve_fps": True, "lossless": False,
    "crf": 25, "preset": 8, "threads": 2, "filter_threads": 1,
    "low_priority": True, "audio_codec": "copy", "faststart": True,
}

REMUX_PROFILE: dict[str, Any] = {
    "container": "mp4", "video_codec": "av1", "encoder": "copy",
    "audio_codec": "copy", "lossless": True, "faststart": True,
    "preserve_resolution": True, "preserve_fps": True, "size_reduction_promised": False,
}


def profile_for_mode(mode_applied: str, *, low_priority: bool = True) -> dict[str, Any]:
    """Return profile metadata dictionary for the applied processing mode."""
    if mode_applied == "remux":
        return dict(REMUX_PROFILE)
    if mode_applied == "mediacodec":
        raise ValueError("MediaCodec H.264 is disabled by the AV1-only policy.")
    profile = dict(DEFAULT_PROFILE)
    profile["low_priority"] = low_priority
    return profile


def utc_now_iso() -> str:
    """Return an ISO-8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class IngestManifest:
    """Tracks state, checksums, sizes, and remote verification for one file."""

    source_path: str
    source_size_bytes: int
    source_sha256: str
    output_path: str
    remote_target: str | None = None
    mode_requested: str = "encode"
    mode_applied: str | None = None
    probe: dict[str, Any] | None = None
    profile: dict[str, Any] | None = None
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    status: str = "queued"
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)
    output_size_bytes: int | None = None
    output_sha256: str | None = None
    remote_verified: bool = False
    error: str | None = None
    history: list[dict[str, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.history:
            self.history.append({"state": self.status, "at": self.created_at})

    def transition(self, new_state: str, error_message: str | None = None) -> None:
        """Update job status and append an immutable history entry."""
        if new_state not in VALID_STATES:
            raise ValueError(f"Invalid manifest state: {new_state}")
        now = utc_now_iso()
        self.status = new_state
        self.updated_at = now
        if error_message is not None:
            self.error = error_message
        self.history.append({"state": new_state, "at": now})

    def to_dict(self) -> dict[str, Any]:
        """Serialize manifest to a JSON-compatible dictionary."""
        return {
            "schema": MANIFEST_SCHEMA,
            "job_id": self.job_id,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "source": {
                "path": self.source_path,
                "size_bytes": self.source_size_bytes,
                "sha256": self.source_sha256,
            },
            "output": {
                "path": self.output_path,
                "size_bytes": self.output_size_bytes,
                "sha256": self.output_sha256,
            },
            "mode": {
                "requested": self.mode_requested,
                "applied": self.mode_applied,
            },
            "probe": self.probe,
            "profile": dict(self.profile) if self.profile is not None else dict(DEFAULT_PROFILE),
            "remote": {
                "target": self.remote_target,
                "verified": self.remote_verified,
            }
            if self.remote_target is not None
            else None,
            "error": self.error,
            "history": list(self.history),
        }

    def save_atomic(self, manifest_path: Path) -> None:
        """Persist manifest atomically via temp file + fsync + os.replace."""
        payload = json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n"
        tmp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=manifest_path.parent,
                prefix=f".{manifest_path.stem}-",
                suffix=".tmp",
                delete=False,
            ) as tmp_file:
                tmp_path = tmp_file.name
                tmp_file.write(payload)
                tmp_file.flush()
                os.fsync(tmp_file.fileno())
            os.replace(tmp_path, manifest_path)
        except Exception:
            if tmp_path is not None and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            raise
