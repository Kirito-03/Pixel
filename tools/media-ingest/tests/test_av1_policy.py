"""Regression tests for AV1-only quality and queue reuse policy."""
import json
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

PACKAGE_DIR = Path(__file__).resolve().parent.parent
if str(PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(PACKAGE_DIR))

from ingest import (IngestError, ProbeResult, build_ffmpeg_command, compute_sha256,
                    select_av1_encoder, validate_av1_output)
from queue_store import _load_valid_encoded_manifest


class Av1PolicyTests(unittest.TestCase):
    def test_no_resize_or_frame_rate_conversion_and_no_audio_reencode(self):
        cmd = build_ffmpeg_command(Path("source.mkv"), Path("out.mp4"), pixel_format="yuv420p10le")
        self.assertIn("libsvtav1", cmd)
        self.assertEqual(cmd[cmd.index("-preset")+1], "8")
        self.assertIn("lp=2", cmd)
        self.assertNotIn("-vf", cmd)
        self.assertNotIn("-r", cmd)
        self.assertEqual(cmd[cmd.index("-c:a")+1], "copy")
        self.assertEqual(cmd[cmd.index("-pix_fmt")+1], "yuv420p10le")

    def test_av1_encoder_fallback_and_absence(self):
        for stdout, expected in (("libsvtav1 libaom-av1", "libsvtav1"), ("libaom-av1", "libaom-av1")):
            with patch("ingest.subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout=stdout, stderr="")):
                self.assertEqual(select_av1_encoder("ffmpeg"), expected)
        with patch("ingest.subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout="libx264", stderr="")):
            with self.assertRaises(IngestError):
                select_av1_encoder("ffmpeg")

    def test_reject_output_degradation_before_upload(self):
        source = ProbeResult("h264", "yuv420p10le", 1920, 1080, ("aac",), "mkv", False, "nonAV1", 1455, 24)
        valid = replace(source, video_codec="av1")
        validate_av1_output(source, valid)
        for patch_values in ({"video_codec": "h264"}, {"width": 1280}, {"height": 720},
                             {"video_pix_fmt": "yuv420p"}, {"fps": 12}, {"duration": 1000}, {"audio_codecs": ()}):
            with self.subTest(values=patch_values), self.assertRaises(IngestError):
                validate_av1_output(source, replace(valid, **patch_values))

    def test_h264_manifest_is_not_resumed_as_av1_even_if_hash_matches(self):
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / "out.mp4"
            manifest = Path(root) / "out.json"
            output.write_bytes(b"legacy-prepared-video")
            sha, size = compute_sha256(output)
            data = {"output": {"sha256": sha, "size_bytes": size}, "profile": {"video_codec": "h264"}}
            manifest.write_text(json.dumps(data))
            self.assertIsNone(_load_valid_encoded_manifest(manifest, output))
            data["profile"] = {"video_codec": "av1", "output_video_codec": "av1"}
            manifest.write_text(json.dumps(data))
            self.assertIsNotNone(_load_valid_encoded_manifest(manifest, output))
