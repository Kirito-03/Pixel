"""Unit tests for Pixel media-ingest MVP CLI using mocked ffmpeg/rclone."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PACKAGE_DIR = Path(__file__).resolve().parent.parent
if str(PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(PACKAGE_DIR))

from media_fakes import media_tool_response
import cli  # noqa: E402
from ingest import IngestError, run_ingest, validate_and_build_config  # noqa: E402
from validators import ValidationError, sanitize_text  # noqa: E402


class MediaIngestTests(unittest.TestCase):
    """Verify validation, security boundaries, manifest states, and mocked execution."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.input_file = self.root / "source.mkv"
        self.input_file.write_bytes(b"fake-video-content-1234567890")
        self.output_file = self.root / "episode01.mp4"
        self.manifest_file = self.root / "episode01.manifest.json"

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_cli_help_exits_zero(self) -> None:
        with self.assertRaises(SystemExit) as ctx:
            cli.main(["--help"])
        self.assertEqual(ctx.exception.code, 0)

    def test_dry_run_executes_nothing_and_writes_no_files(self) -> None:
        with patch("ingest.subprocess.run") as mock_run:
            code = cli.main(
                [
                    "--input",
                    str(self.input_file),
                    "--output",
                    str(self.output_file),
                    "--manifest",
                    str(self.manifest_file),
                    "--remote",
                    "gdrive_privado:pixel/episode01.mp4",
                    "--dry-run",
                ]
            )
        self.assertEqual(code, 0)
        mock_run.assert_not_called()
        self.assertFalse(self.output_file.exists())
        self.assertFalse(self.manifest_file.exists())

    def test_local_encode_success_preserves_original_and_writes_manifest(self) -> None:
        captured_cmds: list[tuple[list[str], dict]] = []

        def fake_run(cmd, **kwargs):
            captured_cmds.append((cmd, kwargs))
            response = media_tool_response(cmd)
            if response is not None:
                return response
            Path(cmd[-1]).write_bytes(b"encoded-mp4-bytes")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        cfg = validate_and_build_config(
            input_path=str(self.input_file),
            output_path=str(self.output_file),
            manifest_path=str(self.manifest_file),
            allowed_root=str(self.root),
        )
        with patch("ingest.subprocess.run", side_effect=fake_run):
            result = run_ingest(cfg)

        self.assertEqual(len(captured_cmds), 4)
        cmd, kwargs = next(item for item in captured_cmds if item[0][0] == "ffmpeg" and "-encoders" not in item[0])
        self.assertIs(kwargs["shell"], False)
        self.assertIn("libsvtav1", cmd)
        self.assertIn("25", cmd)
        self.assertIn("lp=2", cmd)
        self.assertIn("+faststart", cmd)
        self.assertIn("-n", cmd)
        self.assertNotIn("-vf", cmd)
        self.assertNotIn("-r", cmd)
        self.assertEqual(result["profile"]["video_codec"], "av1")

        self.assertTrue(self.input_file.exists())
        self.assertEqual(self.input_file.read_bytes(), b"fake-video-content-1234567890")
        self.assertEqual(result["status"], "encoded")
        self.assertIsNone(result["remote"])
        self.assertEqual(result["source"]["size_bytes"], len(b"fake-video-content-1234567890"))
        self.assertEqual(result["output"]["size_bytes"], len(b"encoded-mp4-bytes"))
        self.assertEqual(len(result["source"]["sha256"]), 64)
        self.assertEqual(len(result["output"]["sha256"]), 64)

        saved = json.loads(self.manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(saved["status"], "encoded")

    def test_remote_upload_and_check_marks_ready(self) -> None:
        calls: list[list[str]] = []

        def fake_run(cmd, **kwargs):
            self.assertIs(kwargs["shell"], False)
            calls.append(cmd)
            response = media_tool_response(cmd)
            if response is not None:
                return response
            if Path(cmd[0]).name == "ffmpeg":
                Path(cmd[-1]).write_bytes(b"mp4-ready-bytes")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        cfg = validate_and_build_config(
            input_path=str(self.input_file),
            output_path=str(self.output_file),
            manifest_path=str(self.manifest_file),
            remote_target="gdrive_privado:anime/ep/episode01.mp4",
        )
        with patch("ingest.subprocess.run", side_effect=fake_run):
            result = run_ingest(cfg)

        remote_calls = [cmd for cmd in calls if cmd[0] == "rclone"]
        self.assertEqual(len(remote_calls), 2)
        self.assertEqual(remote_calls[0][0:2], ["rclone", "copyto"])
        self.assertEqual(remote_calls[1][0:3], ["rclone", "check", "--one-way"])
        self.assertEqual(result["status"], "ready")
        self.assertTrue(result["remote"]["verified"])
        states = [entry["state"] for entry in result["history"]]
        self.assertEqual(
            states,
            ["queued", "encoding", "encoded", "uploading", "verifying", "ready"],
        )

    def test_rclone_check_failure_does_not_mark_ready(self) -> None:
        def fake_run(cmd, **kwargs):
            response = media_tool_response(cmd)
            if response is not None:
                return response
            if cmd[0] == "ffmpeg":
                Path(cmd[-1]).write_bytes(b"mp4-bytes")
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[0] == "rclone" and cmd[1] == "copyto":
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="checksum mismatch")

        cfg = validate_and_build_config(
            input_path=str(self.input_file),
            output_path=str(self.output_file),
            manifest_path=str(self.manifest_file),
            remote_target="gdrive_privado:anime/episode01.mp4",
        )
        with patch("ingest.subprocess.run", side_effect=fake_run):
            with self.assertRaises(IngestError):
                run_ingest(cfg)

        saved = json.loads(self.manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(saved["status"], "error")
        self.assertFalse(saved["remote"]["verified"])
        self.assertIn("rclone check exited with code 1", saved["error"])

    def test_ffmpeg_timeout_sets_error_state(self) -> None:
        cfg = validate_and_build_config(
            input_path=str(self.input_file),
            output_path=str(self.output_file),
            manifest_path=str(self.manifest_file),
            ffmpeg_timeout=5,
        )
        def timed_out(cmd, **kwargs):
            response = media_tool_response(cmd)
            if response is not None:
                return response
            raise subprocess.TimeoutExpired(cmd=cmd, timeout=5)

        with patch("ingest.subprocess.run", side_effect=timed_out):
            with self.assertRaises(IngestError) as ctx:
                run_ingest(cfg)
        self.assertIn("timed out after 5s", str(ctx.exception))
        saved = json.loads(self.manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(saved["status"], "error")

    def test_rejects_url_input(self) -> None:
        with self.assertRaises(ValidationError):
            validate_and_build_config(
                input_path="https://example.com/video.mp4",
                output_path=str(self.output_file),
                manifest_path=str(self.manifest_file),
            )

    def test_rejects_symlinks_on_input_and_output(self) -> None:
        link_in = self.root / "link_in.mkv"
        os.symlink(self.input_file, link_in)
        with self.assertRaises(ValidationError):
            validate_and_build_config(
                input_path=str(link_in),
                output_path=str(self.output_file),
                manifest_path=str(self.manifest_file),
            )

        link_out = self.root / "link_out.mp4"
        os.symlink(self.root / "nonexistent.mp4", link_out)
        with self.assertRaises(ValidationError):
            validate_and_build_config(
                input_path=str(self.input_file),
                output_path=str(link_out),
                manifest_path=str(self.manifest_file),
            )

    def test_rejects_accidental_overwrite(self) -> None:
        self.output_file.write_bytes(b"existing")
        with self.assertRaises(ValidationError):
            validate_and_build_config(
                input_path=str(self.input_file),
                output_path=str(self.output_file),
                manifest_path=str(self.manifest_file),
            )

    def test_rejects_allowed_root_escape(self) -> None:
        subdir = self.root / "allowed"
        subdir.mkdir()
        with self.assertRaises(ValidationError):
            validate_and_build_config(
                input_path=str(self.input_file),
                output_path=str(subdir / "out.mp4"),
                manifest_path=str(subdir / "out.json"),
                allowed_root=str(subdir),
            )

    def test_rejects_unsafe_remote_targets(self) -> None:
        bad_remotes = [
            "-flag:file.mp4",
            ":drive:episode01.mp4",
            "gdrive:../secret/episode01.mp4",
            "gdrive:folder/",
            "user:pass@gdrive:episode01.mp4",
            "gdrive:folder/different_name.mp4",
            "https://drive.google.com/episode01.mp4",
        ]
        for bad in bad_remotes:
            with self.subTest(remote=bad):
                with self.assertRaises(ValidationError):
                    validate_and_build_config(
                        input_path=str(self.input_file),
                        output_path=str(self.output_file),
                        manifest_path=str(self.manifest_file),
                        remote_target=bad,
                    )

    def test_sanitize_text_redacts_signed_urls_and_tokens(self) -> None:
        raw = (
            "Failed https://user:secretpass@host.example/v.mp4"
            "?X-Amz-Signature=deadbeef&token=abc123 Authorization: Bearer mysecrettoken"
        )
        cleaned = sanitize_text(raw)
        self.assertNotIn("secretpass", cleaned)
        self.assertNotIn("deadbeef", cleaned)
        self.assertNotIn("abc123", cleaned)
        self.assertNotIn("mysecrettoken", cleaned)


if __name__ == "__main__":
    unittest.main()
