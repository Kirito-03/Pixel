"""Tests for auto/remux/encode/mediacodec modes and SQLite batch queue."""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PACKAGE_DIR = Path(__file__).resolve().parent.parent
if str(PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR := str(PACKAGE_DIR)))

import cli  # noqa: E402
from ingest import (  # noqa: E402
    IngestError,
    compute_sha256,
    run_ingest,
    validate_and_build_config,
)
from queue_store import (  # noqa: E402
    WorkerLockError,
    acquire_worker_lock,
    enqueue_job,
    list_jobs,
    run_queue,
)


class ModeAndQueueTests(unittest.TestCase):
    """Verify ffprobe auto/remux/encode, experimental mediacodec, flock, and recovery."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.db_path = self.root / "ingest_queue.db"
        self.input_a = self.root / "ep01.mkv"
        self.input_a.write_bytes(b"original-video-a-0123456789")
        self.output_a = self.root / "ep01.mp4"
        self.manifest_a = self.root / "ep01.manifest.json"

        self.input_b = self.root / "ep02.mkv"
        self.input_b.write_bytes(b"original-video-b-9876543210")
        self.output_b = self.root / "ep02.mp4"
        self.manifest_b = self.root / "ep02.manifest.json"

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_auto_mode_remuxes_compatible_h264_aac_without_size_promise(self) -> None:
        calls: list[tuple[list[str], dict]] = []

        def fake_run(cmd, **kwargs):
            calls.append((cmd, kwargs))
            if Path(cmd[0]).name == "ffprobe":
                probe_json = json.dumps(
                    {
                        "streams": [
                            {
                                "codec_type": "video",
                                "codec_name": "h264",
                                "pix_fmt": "yuv420p",
                                "width": 1920,
                                "height": 1080,
                            },
                            {"codec_type": "audio", "codec_name": "aac"},
                        ],
                        "format": {"format_name": "matroska,webm"},
                    }
                )
                return subprocess.CompletedProcess(cmd, 0, stdout=probe_json, stderr="")
            Path(cmd[-1]).write_bytes(b"remuxed-mp4-bytes")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        cfg = validate_and_build_config(
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
            mode="auto",
            allowed_root=str(self.root),
        )
        with patch("ingest.subprocess.run", side_effect=fake_run):
            result = run_ingest(cfg)

        self.assertEqual(len(calls), 2)
        ffmpeg_cmd, ffmpeg_kwargs = calls[1]
        self.assertIn("-c", ffmpeg_cmd)
        self.assertIn("copy", ffmpeg_cmd)
        self.assertNotIn("libx264", ffmpeg_cmd)
        if os.name == "posix":
            self.assertIn("preexec_fn", ffmpeg_kwargs)
        self.assertEqual(result["mode"], {"requested": "auto", "applied": "remux"})
        self.assertFalse(result["profile"]["size_reduction_promised"])
        self.assertEqual(result["status"], "encoded")
        self.assertIsNone(result["remote"])
        self.assertTrue(self.input_a.exists())

    def test_auto_mode_falls_back_to_encode_for_hevc_or_10bit_or_ac3(self) -> None:
        for streams in (
            [
                {"codec_type": "video", "codec_name": "hevc", "pix_fmt": "yuv420p"},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
            [
                {"codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p10le"},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
            [
                {"codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p"},
                {"codec_type": "audio", "codec_name": "ac3"},
            ],
        ):
            out = self.root / f"out_{streams[0]['codec_name']}_{streams[0]['pix_fmt']}_{streams[1]['codec_name']}.mp4"
            man = self.root / f"{out.stem}.json"
            calls: list[list[str]] = []

            def fake_run(cmd, **kwargs):
                calls.append(cmd)
                if Path(cmd[0]).name == "ffprobe":
                    return subprocess.CompletedProcess(
                        cmd, 0, stdout=json.dumps({"streams": streams}), stderr=""
                    )
                Path(cmd[-1]).write_bytes(b"encoded-720p-bytes")
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

            cfg = validate_and_build_config(
                input_path=str(self.input_a),
                output_path=str(out),
                manifest_path=str(man),
                mode="auto",
                low_priority=False,
            )
            with patch("ingest.subprocess.run", side_effect=fake_run):
                result = run_ingest(cfg)

            self.assertEqual(result["mode"]["applied"], "encode")
            ffmpeg_cmd = calls[1]
            self.assertIn("libx264", ffmpeg_cmd)
            self.assertIn("veryfast", ffmpeg_cmd)
            self.assertIn("2", ffmpeg_cmd)
            self.assertIn("1", ffmpeg_cmd)
            self.assertEqual(result["profile"]["preset"], "veryfast")
            self.assertEqual(result["profile"]["threads"], 2)
            self.assertEqual(result["profile"]["filter_threads"], 1)

    def test_explicit_remux_rejects_incompatible_streams(self) -> None:
        def fake_probe(cmd, **kwargs):
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout=json.dumps(
                    {
                        "streams": [
                            {"codec_type": "video", "codec_name": "vp9", "pix_fmt": "yuv420p"},
                            {"codec_type": "audio", "codec_name": "opus"},
                        ]
                    }
                ),
                stderr="",
            )

        cfg = validate_and_build_config(
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
            mode="remux",
        )
        with patch("ingest.subprocess.run", side_effect=fake_probe):
            with self.assertRaises(IngestError):
                run_ingest(cfg)
        self.assertFalse(self.output_a.exists())

    def test_experimental_mediacodec_requires_explicit_verification(self) -> None:
        def fake_no_mc(cmd, **kwargs):
            return subprocess.CompletedProcess(
                cmd, 0, stdout=" V..... libx264\n", stderr=""
            )

        cfg = validate_and_build_config(
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
            mode="mediacodec",
        )
        with patch("ingest.subprocess.run", side_effect=fake_no_mc):
            with self.assertRaises(IngestError) as ctx:
                run_ingest(cfg)
        self.assertIn("h264_mediacodec", str(ctx.exception))

        def fake_with_mc(cmd, **kwargs):
            if "-encoders" in cmd:
                return subprocess.CompletedProcess(
                    cmd, 0, stdout=" V..... h264_mediacodec\n", stderr=""
                )
            Path(cmd[-1]).write_bytes(b"mc-mp4-bytes")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        out2 = self.root / "ep01_mc.mp4"
        man2 = self.root / "ep01_mc.json"
        cfg2 = validate_and_build_config(
            input_path=str(self.input_a),
            output_path=str(out2),
            manifest_path=str(man2),
            mode="mediacodec",
        )
        with patch("ingest.subprocess.run", side_effect=fake_with_mc):
            result = run_ingest(cfg2)
        self.assertEqual(result["mode"]["applied"], "mediacodec")
        self.assertTrue(result["profile"]["experimental"])

    def test_queue_cli_add_list_and_run_local_and_remote(self) -> None:
        code_add_a = cli.main(
            [
                "queue-add",
                "--db",
                str(self.db_path),
                "--input",
                str(self.input_a),
                "--output",
                str(self.output_a),
                "--manifest",
                str(self.manifest_a),
                "--mode",
                "encode",
                "--allowed-root",
                str(self.root),
            ]
        )
        self.assertEqual(code_add_a, 0)

        code_add_b = cli.main(
            [
                "queue-add",
                "--db",
                str(self.db_path),
                "--input",
                str(self.input_b),
                "--output",
                str(self.output_b),
                "--manifest",
                str(self.manifest_b),
                "--remote",
                "gdrive_privado:pixel/ep02.mp4",
                "--mode",
                "auto",
                "--allowed-root",
                str(self.root),
            ]
        )
        self.assertEqual(code_add_b, 0)

        listed = list_jobs(db_path=str(self.db_path))
        self.assertEqual(listed["counts"]["queued"], 2)

        def fake_run(cmd, **kwargs):
            exe = Path(cmd[0]).name
            if exe == "ffprobe":
                return subprocess.CompletedProcess(
                    cmd,
                    0,
                    stdout=json.dumps(
                        {
                            "streams": [
                                {"codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p"},
                                {"codec_type": "audio", "codec_name": "aac"},
                            ]
                        }
                    ),
                    stderr="",
                )
            if exe == "ffmpeg":
                Path(cmd[-1]).write_bytes(b"mp4-output-data")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        with patch("ingest.subprocess.run", side_effect=fake_run):
            summary = run_queue(db_path=str(self.db_path), allowed_root=str(self.root))

        self.assertEqual(summary["processed"], 2)
        self.assertEqual(summary["succeeded_encoded"], 1)
        self.assertEqual(summary["succeeded_ready"], 1)
        self.assertEqual(summary["failed"], 0)
        self.assertTrue(self.input_a.exists())
        self.assertTrue(self.input_b.exists())

        after = list_jobs(db_path=str(self.db_path))
        self.assertEqual(after["counts"]["encoded"], 1)
        self.assertEqual(after["counts"]["ready"], 1)

    def test_queue_add_rejects_urls_and_duplicates(self) -> None:
        code = cli.main(
            [
                "queue-add",
                "--db",
                str(self.db_path),
                "--input",
                "https://example.com/ep01.mkv",
                "--output",
                str(self.output_a),
                "--manifest",
                str(self.manifest_a),
            ]
        )
        self.assertEqual(code, 2)

        enqueue_job(
            db_path=str(self.db_path),
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
        )
        code_dup = cli.main(
            [
                "queue-add",
                "--db",
                str(self.db_path),
                "--input",
                str(self.input_b),
                "--output",
                str(self.output_a),
                "--manifest",
                str(self.manifest_b),
            ]
        )
        self.assertEqual(code_dup, 2)

    def test_worker_lock_blocks_concurrent_queue_run(self) -> None:
        enqueue_job(
            db_path=str(self.db_path),
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
        )
        with acquire_worker_lock(self.db_path):
            with self.assertRaises(WorkerLockError):
                run_queue(db_path=str(self.db_path))
            code = cli.main(["queue-run", "--db", str(self.db_path)])
            self.assertEqual(code, 3)

    def test_interrupted_running_job_recovers_and_preserves_original(self) -> None:
        job = enqueue_job(
            db_path=str(self.db_path),
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
            mode="encode",
            max_retries=2,
        )
        # Simulate crash mid-encode: DB stuck in running, partial output & manifest on disk.
        self.output_a.write_bytes(b"corrupt-partial-mp4")
        self.manifest_a.write_text(json.dumps({"status": "encoding"}), encoding="utf-8")
        conn = sqlite3.connect(str(self.db_path))
        conn.execute(
            "UPDATE ingest_jobs SET status = 'running', attempts = 1, worker_pid = 999999 WHERE job_id = ?;",
            (job["job_id"],),
        )
        conn.commit()
        conn.close()

        def fake_ffmpeg(cmd, **kwargs):
            Path(cmd[-1]).write_bytes(b"clean-recovered-mp4")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        with patch("ingest.subprocess.run", side_effect=fake_ffmpeg):
            summary = run_queue(db_path=str(self.db_path))

        self.assertEqual(summary["recovered"], [{"job_id": job["job_id"], "action": "requeued"}])
        self.assertEqual(summary["succeeded_encoded"], 1)
        self.assertTrue(self.input_a.exists())
        self.assertEqual(self.output_a.read_bytes(), b"clean-recovered-mp4")

    def test_interrupted_upload_resumes_without_reencoding(self) -> None:
        job = enqueue_job(
            db_path=str(self.db_path),
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
            remote_target="gdrive_privado:pixel/ep01.mp4",
            mode="encode",
        )
        self.output_a.write_bytes(b"already-encoded-mp4")
        out_sha, out_size = compute_sha256(self.output_a)
        in_sha, in_size = compute_sha256(self.input_a)
        self.manifest_a.write_text(
            json.dumps(
                {
                    "schema": "pixel.media_ingest.v1",
                    "job_id": job["job_id"],
                    "status": "uploading",
                    "source": {"path": str(self.input_a), "size_bytes": in_size, "sha256": in_sha},
                    "output": {"path": str(self.output_a), "size_bytes": out_size, "sha256": out_sha},
                    "mode": {"requested": "encode", "applied": "encode"},
                    "remote": {"target": "gdrive_privado:pixel/ep01.mp4", "verified": False},
                    "history": [{"state": "encoded", "at": "2026-11-13T00:00:00+00:00"}],
                }
            ),
            encoding="utf-8",
        )
        conn = sqlite3.connect(str(self.db_path))
        conn.execute(
            "UPDATE ingest_jobs SET status = 'running', attempts = 1 WHERE job_id = ?;",
            (job["job_id"],),
        )
        conn.commit()
        conn.close()

        calls: list[list[str]] = []

        def fake_rclone(cmd, **kwargs):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        with patch("ingest.subprocess.run", side_effect=fake_rclone):
            summary = run_queue(db_path=str(self.db_path))

        self.assertEqual(summary["succeeded_ready"], 1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0:2], ["rclone", "copyto"])
        self.assertEqual(calls[1][0:2], ["rclone", "check"])

    def test_retries_exhausted_marks_failed_and_sanitizes_error(self) -> None:
        enqueue_job(
            db_path=str(self.db_path),
            input_path=str(self.input_a),
            output_path=str(self.output_a),
            manifest_path=str(self.manifest_a),
            mode="encode",
            max_retries=1,
        )

        def always_fail(cmd, **kwargs):
            return subprocess.CompletedProcess(
                cmd,
                1,
                stdout="",
                stderr="error https://user:secretpass@host/x?token=tok123",
            )

        with patch("ingest.subprocess.run", side_effect=always_fail):
            summary = run_queue(db_path=str(self.db_path))

        self.assertEqual(summary["requeued"], 1)
        self.assertEqual(summary["failed"], 1)
        listed = list_jobs(db_path=str(self.db_path))
        job = listed["jobs"][0]
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["attempts"], 2)
        self.assertNotIn("secretpass", job["last_error"])
        self.assertNotIn("tok123", job["last_error"])
        self.assertTrue(self.input_a.exists())


if __name__ == "__main__":
    unittest.main()
