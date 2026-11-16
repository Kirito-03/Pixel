"""Small mocked ffprobe/encoder responses shared by pipeline lifecycle tests."""
import json
import subprocess
from pathlib import Path


def media_tool_response(cmd, source_codec="h264"):
    if "-encoders" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout=" V..... libsvtav1\n", stderr="")
    if Path(cmd[0]).name == "ffprobe":
        codec = source_codec if Path(cmd[-1]).suffix == ".mkv" else "av1"
        streams = [
            {"codec_type": "video", "codec_name": codec, "pix_fmt": "yuv420p", "width": 1920,
             "height": 1080, "duration": "1455", "avg_frame_rate": "24/1"},
            {"codec_type": "audio", "codec_name": "aac"},
        ]
        return subprocess.CompletedProcess(cmd, 0, stdout=json.dumps({"streams": streams}), stderr="")
    return None
