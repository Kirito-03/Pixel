"""Offline unit tests for queue-add-url (SSRF/DNS pinning, redirects, limits, permissions)."""

from __future__ import annotations

import io
import json
import os
import shutil
import socket
import ssl
import stat
import sys
import tempfile
import unittest
from collections import namedtuple
from pathlib import Path
from unittest.mock import MagicMock, patch

PACKAGE_DIR = Path(__file__).resolve().parent.parent
if str(PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(PACKAGE_DIR))

import cli  # noqa: E402
from ingest import IngestError  # noqa: E402
from queue_store import enqueue_job, enqueue_url_job, list_jobs  # noqa: E402
from url_download import (  # noqa: E402
    _PinnedHTTPSConnection,
    download_https_file,
    is_public_ip,
    resolve_and_validate_public_ips,
)
from validators import MAX_DOWNLOAD_BYTES, ValidationError, sanitize_text  # noqa: E402

_DiskUsage = namedtuple("DiskUsage", ["total", "used", "free"])


class _FakeResponse:
    """In-memory streaming HTTP response stub."""

    def __init__(
        self,
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
        chunks: list[bytes] | None = None,
        read_side_effect: Exception | None = None,
    ) -> None:
        self.status = status
        self._headers = {k.lower(): v for k, v in (headers or {}).items()}
        self._chunks = list(chunks or [])
        self._read_side_effect = read_side_effect
        self._idx = 0

    def getheader(self, name: str, default: str | None = None) -> str | None:
        return self._headers.get(name.lower(), default)

    def read(self, _amt: int = 65536) -> bytes:
        if self._read_side_effect is not None:
            raise self._read_side_effect
        if self._idx >= len(self._chunks):
            return b""
        chunk = self._chunks[self._idx]
        self._idx += 1
        return chunk


def _make_fake_connection_cls(response: _FakeResponse, recorder: list[dict]):
    class _FakeConn:
        def __init__(
            self,
            hostname: str,
            *,
            pinned_ip: str,
            pinned_family: int,
            port: int = 443,
            timeout: float = 30.0,
            context: ssl.SSLContext | None = None,
        ) -> None:
            self.hostname = hostname
            self.pinned_ip = pinned_ip
            self.pinned_family = pinned_family
            self.port = port
            self.timeout = timeout
            self.context = context
            self.sock = MagicMock()
            self.closed = False
            recorder.append(
                {
                    "hostname": hostname,
                    "pinned_ip": pinned_ip,
                    "pinned_family": pinned_family,
                    "port": port,
                    "timeout": timeout,
                }
            )

        def request(self, method: str, target: str, headers: dict[str, str] | None = None) -> None:
            recorder[-1]["method"] = method
            recorder[-1]["target"] = target
            recorder[-1]["headers"] = dict(headers or {})

        def getresponse(self) -> _FakeResponse:
            return response

        def close(self) -> None:
            self.closed = True

    return _FakeConn


class QueueAddUrlTests(unittest.TestCase):
    """Verify queue-add-url security, streaming limits, partial cleanup, and queue-add reuse."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.db_path = self.root / "ingest_queue.db"
        self.dest_file = self.root / "downloaded.mkv"
        self.output_file = self.root / "downloaded.mp4"
        self.manifest_file = self.root / "downloaded.manifest.json"

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_public_ip_classifier_blocks_private_loopback_linklocal_and_v4mapped(self) -> None:
        blocked = [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.5.4",
            "192.168.1.10",
            "169.254.169.254",
            "0.0.0.0",
            "224.0.0.1",
            "::1",
            "fe80::1",
            "fe80::1%eth0",
            "fc00::1",
            "::",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:169.254.169.254",
            "::ffff:192.168.1.1",
        ]
        for addr in blocked:
            with self.subTest(addr=addr):
                self.assertFalse(is_public_ip(addr))

        allowed = ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]
        for addr in allowed:
            with self.subTest(addr=addr):
                self.assertTrue(is_public_ip(addr))

    def test_dns_resolution_requires_all_ips_public(self) -> None:
        def mixed_resolver(host, port, family, socktype):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 443)),
            ]

        with self.assertRaises(ValidationError):
            resolve_and_validate_public_ips("cdn.example.com", resolver=mixed_resolver)

    def test_pinned_https_connection_connects_to_ip_and_verifies_tls_hostname(self) -> None:
        fake_sock = MagicMock()
        fake_ssl_ctx = MagicMock(spec=ssl.SSLContext)
        fake_ssl_ctx.wrap_socket.return_value = MagicMock()

        conn = _PinnedHTTPSConnection(
            "cdn.example.com",
            pinned_ip="93.184.216.34",
            pinned_family=socket.AF_INET,
            port=443,
            timeout=15.0,
            context=fake_ssl_ctx,
        )
        with patch("url_download.socket.socket", return_value=fake_sock) as sock_ctor:
            conn.connect()

        sock_ctor.assert_called_once_with(socket.AF_INET, socket.SOCK_STREAM)
        fake_sock.settimeout.assert_called_once_with(15.0)
        fake_sock.connect.assert_called_once_with(("93.184.216.34", 443))
        fake_ssl_ctx.wrap_socket.assert_called_once_with(
            fake_sock, server_hostname="cdn.example.com"
        )

    def test_rejects_non_https_credentials_ports_disallowed_hosts_and_m3u8(self) -> None:
        bad_urls = [
            "http://cdn.example.com/ep01.mkv",
            "ftp://cdn.example.com/ep01.mkv",
            "https://user:secret@cdn.example.com/ep01.mkv",
            "https://user@cdn.example.com/ep01.mkv",
            "https://cdn.example.com:8443/ep01.mkv",
            "https://cdn.example.com:80/ep01.mkv",
            "https://evil.example.com/ep01.mkv",
            "https://cdn.example.com/playlist.m3u8",
            "https://cdn.example.com/ep01.mkv#frag",
            "https://cdn.example.com/",
        ]
        for bad in bad_urls:
            with self.subTest(url=bad):
                with self.assertRaises(ValidationError):
                    download_https_file(
                        url=bad,
                        allow_hosts=["cdn.example.com"],
                        dest_path=self.dest_file,
                    )

        with self.assertRaises(ValidationError):
            download_https_file(
                url="https://cdn.example.com/ep01.mkv",
                allow_hosts=["*.example.com"],
                dest_path=self.dest_file,
            )

        with self.assertRaises(ValidationError):
            download_https_file(
                url="https://cdn.example.com/ep01.mkv",
                allow_hosts=["cdn.example.com"],
                dest_path=self.dest_file,
                max_bytes=MAX_DOWNLOAD_BYTES + 1,
            )

    def test_rejects_redirects_without_following_and_creates_no_partial(self) -> None:
        for status in (301, 302, 307, 308):
            with self.subTest(status=status):
                recorder: list[dict] = []
                resp = _FakeResponse(
                    status=status,
                    headers={"Location": "https://other.example.com/evil.mkv"},
                )
                with self.assertRaises(IngestError) as ctx:
                    download_https_file(
                        url="https://cdn.example.com/ep01.mkv?token=topsecret999",
                        allow_hosts=["cdn.example.com"],
                        dest_path=self.dest_file,
                        resolver=lambda *a: [
                            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
                        ],
                        connection_factory=_make_fake_connection_cls(resp, recorder),
                    )
                self.assertIn("redirects are disabled", str(ctx.exception))
                self.assertNotIn("topsecret999", str(ctx.exception))
                self.assertEqual(len(recorder), 1)
                self.assertFalse(self.dest_file.exists())
                self.assertEqual(list(self.root.glob("*.part")), [])

    def test_rejects_html_and_m3u8_content_types(self) -> None:
        for ctype in ("text/html; charset=utf-8", "application/vnd.apple.mpegurl"):
            with self.subTest(ctype=ctype):
                recorder: list[dict] = []
                resp = _FakeResponse(status=200, headers={"Content-Type": ctype})
                with self.assertRaises(IngestError):
                    download_https_file(
                        url="https://cdn.example.com/file",
                        allow_hosts=["cdn.example.com"],
                        dest_path=self.dest_file,
                        resolver=lambda *a: [
                            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
                        ],
                        connection_factory=_make_fake_connection_cls(resp, recorder),
                    )

    def test_size_limit_content_length_and_streaming_cleanup_only_own_partial(self) -> None:
        foreign_part = self.root / ".other.1234.part"
        foreign_part.write_bytes(b"keep-me")

        # 1) Content-Length exceeds max_bytes before body read
        recorder: list[dict] = []
        resp = _FakeResponse(
            status=200,
            headers={"Content-Type": "video/mp4", "Content-Length": "2048"},
            chunks=[b"x" * 2048],
        )
        with self.assertRaises(IngestError):
            download_https_file(
                url="https://cdn.example.com/ep01.mp4",
                allow_hosts=["cdn.example.com"],
                dest_path=self.dest_file,
                max_bytes=1024,
                resolver=lambda *a: [
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
                ],
                connection_factory=_make_fake_connection_cls(resp, recorder),
            )
        self.assertTrue(foreign_part.exists())
        self.assertFalse(self.dest_file.exists())

        # 2) Streaming exceeds max_bytes without Content-Length; deletes only own partial
        recorder.clear()
        resp_stream = _FakeResponse(
            status=200,
            headers={"Content-Type": "application/octet-stream"},
            chunks=[b"a" * 600, b"b" * 600],
        )
        with self.assertRaises(IngestError):
            download_https_file(
                url="https://cdn.example.com/ep01.mp4",
                allow_hosts=["cdn.example.com"],
                dest_path=self.dest_file,
                max_bytes=1024,
                resolver=lambda *a: [
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
                ],
                connection_factory=_make_fake_connection_cls(resp_stream, recorder),
            )
        self.assertTrue(foreign_part.exists())
        self.assertFalse(self.dest_file.exists())
        self.assertEqual(
            [p.name for p in self.root.iterdir()],
            [foreign_part.name],
        )

    def test_insufficient_disk_space_and_socket_timeout(self) -> None:
        recorder: list[dict] = []
        resp = _FakeResponse(
            status=200,
            headers={"Content-Type": "video/mp4", "Content-Length": "5000"},
            chunks=[b"a" * 5000],
        )
        with self.assertRaises(IngestError):
            download_https_file(
                url="https://cdn.example.com/ep01.mp4",
                allow_hosts=["cdn.example.com"],
                dest_path=self.dest_file,
                resolver=lambda *a: [
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
                ],
                connection_factory=_make_fake_connection_cls(resp, recorder),
                disk_usage_fn=lambda _p: _DiskUsage(total=10000, used=9000, free=1000),
            )

        resp_timeout = _FakeResponse(
            status=200,
            headers={"Content-Type": "video/mp4"},
            read_side_effect=socket.timeout("timed out"),
        )
        with self.assertRaises(IngestError):
            download_https_file(
                url="https://cdn.example.com/ep01.mp4",
                allow_hosts=["cdn.example.com"],
                dest_path=self.dest_file,
                resolver=lambda *a: [
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
                ],
                connection_factory=_make_fake_connection_cls(resp_timeout, recorder),
            )
        self.assertEqual(list(self.root.glob(".*.part")), [])

    def test_cli_queue_add_url_success_mode_600_and_redacts_query_secrets(self) -> None:
        payload = b"video-stream-chunk-1" + b"video-stream-chunk-2"
        recorder: list[dict] = []
        resp = _FakeResponse(
            status=200,
            headers={"Content-Type": "video/x-matroska", "Content-Length": str(len(payload))},
            chunks=[b"video-stream-chunk-1", b"video-stream-chunk-2"],
        )

        def fake_resolver(host, port, family, socktype):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

        stdout_buf = io.StringIO()
        with (
            patch("url_download.socket.getaddrinfo", side_effect=fake_resolver),
            patch(
                "url_download._PinnedHTTPSConnection",
                new=_make_fake_connection_cls(resp, recorder),
            ),
            patch("sys.stdout", stdout_buf),
        ):
            rc = cli.main(
                [
                    "queue-add-url",
                    "--db",
                    str(self.db_path),
                    "--url",
                    "https://cdn.example.com/anime/ep01.mkv?sig=my_super_secret_sig&exp=9999",
                    "--allow-host",
                    "other.example.com",
                    "--allow-host",
                    "cdn.example.com",
                    "--input",
                    str(self.dest_file),
                    "--output",
                    str(self.output_file),
                    "--manifest",
                    str(self.manifest_file),
                    "--mode",
                    "auto",
                    "--allowed-root",
                    str(self.root),
                ]
            )

        self.assertEqual(rc, 0)
        out_text = stdout_buf.getvalue()
        self.assertNotIn("my_super_secret_sig", out_text)
        data = json.loads(out_text)
        self.assertEqual(data["status"], "queued")
        self.assertEqual(data["input_path"], str(self.dest_file))
        self.assertEqual(data["download"]["bytes_downloaded"], len(payload))
        self.assertEqual(data["download"]["resolved_ip"], "93.184.216.34")
        self.assertEqual(
            data["download"]["url"],
            "https://cdn.example.com/anime/ep01.mkv?[REDACTED]",
        )
        self.assertEqual(self.dest_file.read_bytes(), payload)
        mode = stat.S_IMODE(os.stat(self.dest_file).st_mode)
        self.assertEqual(mode, 0o600)

        listed = list_jobs(db_path=str(self.db_path), allowed_root=str(self.root))
        self.assertEqual(listed["counts"]["queued"], 1)

    def test_enqueue_failure_preserves_completed_downloaded_file_for_review(self) -> None:
        # Pre-seed DB with same output_path so enqueue_job fails with duplicate error
        existing_input = self.root / "existing.mkv"
        existing_input.write_bytes(b"existing-video")
        enqueue_job(
            db_path=str(self.db_path),
            input_path=str(existing_input),
            output_path=str(self.output_file),
            manifest_path=str(self.root / "other.manifest.json"),
            allowed_root=str(self.root),
        )

        payload = b"complete-downloaded-file-for-review"
        recorder: list[dict] = []
        resp = _FakeResponse(
            status=200,
            headers={"Content-Type": "video/mp4", "Content-Length": str(len(payload))},
            chunks=[payload],
        )

        with (
            patch(
                "url_download.socket.getaddrinfo",
                return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))],
            ),
            patch(
                "url_download._PinnedHTTPSConnection",
                new=_make_fake_connection_cls(resp, recorder),
            ),
        ):
            with self.assertRaises(ValidationError):
                enqueue_url_job(
                    db_path=str(self.db_path),
                    url="https://cdn.example.com/ep01.mp4?token=secret",
                    allow_hosts=["cdn.example.com"],
                    input_path=str(self.dest_file),
                    output_path=str(self.output_file),
                    manifest_path=str(self.manifest_file),
                    allowed_root=str(self.root),
                )

        # Complete downloaded file must remain intact for manual review
        self.assertTrue(self.dest_file.exists())
        self.assertEqual(self.dest_file.read_bytes(), payload)

    def test_sanitize_text_redacts_any_url_query(self) -> None:
        raw = "Error fetching https://cdn.example.com/file.mkv?custom_secret=xyz123&dl=1"
        cleaned = sanitize_text(raw)
        self.assertNotIn("xyz123", cleaned)
        self.assertNotIn("custom_secret", cleaned)
        self.assertIn("https://cdn.example.com/file.mkv?[REDACTED]", cleaned)


if __name__ == "__main__":
    unittest.main()


class ProviderPortTests(unittest.TestCase):
    def test_provider_exception_is_explicit_and_default_stays_strict(self):
        from validators import validate_direct_https_url
        url = 'https://a3.mp4upload.com:183/video.mp4'
        with self.assertRaises(ValidationError):
            validate_direct_https_url(url, ('a3.mp4upload.com',))
        _, host, target = validate_direct_https_url(url, ('a3.mp4upload.com',), (443,183))
        self.assertEqual(host, 'a3.mp4upload.com')
        self.assertEqual(target, '/video.mp4')
        with self.assertRaises(ValidationError):
            validate_direct_https_url('https://a3.mp4upload.com:184/video.mp4', ('a3.mp4upload.com',), (443,183))


class SourceHeaderTests(unittest.TestCase):
    def test_disallows_credentials_and_header_injection_before_network(self):
        for headers in ({'Authorization':'Bearer secret'}, {'User-Agent':'bad\r\nHeader:value'}):
            with self.assertRaises(ValidationError):
                download_https_file(url='https://cdn.example.com/video.mp4',allow_hosts=['cdn.example.com'],dest_path=Path('/tmp/never-download.mp4'),request_headers=headers)


class AndroidPromotionTests(unittest.TestCase):
    def test_without_os_link_uses_exclusive_copy_and_never_overwrites(self):
        from url_download import _promote_partial_file
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'source.part';dest=Path(folder)/'dest.mp4'
            source.write_bytes(b'complete-video')
            with patch('url_download.os.link', None, create=True):
                _promote_partial_file(source,dest)
            self.assertEqual(dest.read_bytes(),b'complete-video')
            self.assertFalse(source.exists())
            source.write_bytes(b'other')
            with self.assertRaises(ValidationError):
                _promote_partial_file(source,dest)
            self.assertEqual(dest.read_bytes(),b'complete-video')
