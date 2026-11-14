"""Safe direct HTTPS file downloader with SSRF/DNS-rebinding protection."""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import os
import shutil
import socket
import ssl
import time
import uuid
from urllib.parse import urlsplit
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from ingest import IngestError
from validators import (
    DEFAULT_DOWNLOAD_TIMEOUT,
    DEFAULT_SOCKET_TIMEOUT,
    MAX_DOWNLOAD_BYTES,
    ValidationError,
    sanitize_text,
    validate_allow_hosts,
    validate_direct_https_url,
    validate_max_bytes,
    validate_timeout,
)

DOWNLOAD_CHUNK_SIZE = 65536  # 64 KiB
_DISALLOWED_CONTENT_TYPES = frozenset(
    {
        "text/html",
        "application/xhtml+xml",
        "application/vnd.apple.mpegurl",
        "application/x-mpegurl",
    }
)


@dataclass(frozen=True)
class DownloadResult:
    """Metadata returned after a successful direct HTTPS download."""

    dest_path: Path
    redacted_url: str
    hostname: str
    resolved_ip: str
    bytes_downloaded: int
    sha256: str


def _is_public_ip_obj(
    ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address,
) -> bool:
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped is not None:
        return _is_public_ip_obj(ip_obj.ipv4_mapped)
    return (
        ip_obj.is_global
        and not ip_obj.is_private
        and not ip_obj.is_loopback
        and not ip_obj.is_link_local
        and not ip_obj.is_multicast
        and not ip_obj.is_reserved
        and not ip_obj.is_unspecified
    )


def is_public_ip(ip_str: str) -> bool:
    """Return True only if ip_str is a strictly public global IPv4/IPv6 address."""
    if not isinstance(ip_str, str) or not ip_str or "%" in ip_str:
        return False
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return _is_public_ip_obj(ip_obj)


def resolve_and_validate_public_ips(
    hostname: str,
    *,
    resolver: Callable[..., list[Any]] | None = None,
) -> list[tuple[int, str]]:
    """Resolve hostname once and require every returned IP address to be public."""
    active_resolver = resolver if resolver is not None else socket.getaddrinfo
    try:
        infos = active_resolver(hostname, 443, 0, socket.SOCK_STREAM)
    except OSError as exc:
        raise IngestError(
            f"DNS resolution failed for host '{hostname}': {sanitize_text(str(exc))}"
        ) from exc

    resolved: list[tuple[int, str]] = []
    seen: set[tuple[int, str]] = set()
    for entry in infos:
        family = entry[0]
        sockaddr = entry[4]
        ip_str = str(sockaddr[0])
        if not is_public_ip(ip_str):
            raise ValidationError(
                f"Blocked non-public IP address '{ip_str}' resolved for host '{hostname}'."
            )
        key = (int(family), ip_str)
        if key not in seen:
            seen.add(key)
            resolved.append(key)

    if not resolved:
        raise IngestError(f"DNS resolution returned no addresses for host '{hostname}'.")
    return resolved


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPSConnection that connects to a pre-validated IP while preserving TLS hostname."""

    def __init__(
        self,
        hostname: str,
        *,
        pinned_ip: str,
        pinned_family: int,
        port: int = 443,
        timeout: float = float(DEFAULT_SOCKET_TIMEOUT),
        context: ssl.SSLContext | None = None,
    ) -> None:
        super().__init__(hostname, port=port, timeout=timeout, context=context)
        self._pinned_ip = pinned_ip
        self._pinned_family = pinned_family

    def connect(self) -> None:
        sock = socket.socket(self._pinned_family, socket.SOCK_STREAM)
        try:
            sock.settimeout(self.timeout)
            sock.connect((self._pinned_ip, self.port))
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


def _promote_partial_file(partial_path: Path, dest_path: Path) -> None:
    """Move completed partial file into dest_path without overwriting existing files."""
    if dest_path.exists() or dest_path.is_symlink():
        raise ValidationError(
            f"Refusing to overwrite existing local input path: {dest_path}"
        )
    link = getattr(os, 'link', None)
    if link is not None:
        try:
            link(partial_path, dest_path)
            os.unlink(partial_path)
            return
        except OSError:
            pass
    # Android/Termux builds can omit os.link. Reserve the destination exclusively
    # and copy with bounded memory rather than rename over an existing file.
    fd = os.open(dest_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as output, partial_path.open('rb') as source:
            shutil.copyfileobj(source, output, 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        dest_path.unlink(missing_ok=True)
        raise
    partial_path.unlink()


def download_https_file(
    *,
    url: str,
    allow_hosts: list[str] | tuple[str, ...],
    dest_path: Path,
    allowed_ports: tuple[int, ...] = (443,),
    request_headers: dict[str, str] | None = None,
    max_bytes: int = MAX_DOWNLOAD_BYTES,
    socket_timeout: int = DEFAULT_SOCKET_TIMEOUT,
    download_timeout: int = DEFAULT_DOWNLOAD_TIMEOUT,
    resolver: Callable[..., list[Any]] | None = None,
    connection_factory: Callable[..., Any] | None = None,
    ssl_context: ssl.SSLContext | None = None,
    disk_usage_fn: Callable[[Path], Any] | None = None,
) -> DownloadResult:
    """Download a direct HTTPS file using pinned public IP and confined mode-0600 partial file."""
    safe_headers = {}
    for key, value in (request_headers or {}).items():
        if key not in ('Referer', 'User-Agent') or not isinstance(value, str) or any(ord(c) < 32 or ord(c) > 126 for c in value):
            raise ValidationError('Unsupported or invalid source request header')
        safe_headers[key] = value
    allowed_hosts = validate_allow_hosts(allow_hosts)
    redacted_url, hostname, request_target = validate_direct_https_url(url, allowed_hosts, allowed_ports)
    validated_max_bytes = validate_max_bytes(max_bytes)
    validated_sock_timeout = validate_timeout(socket_timeout, "socket_timeout")
    validated_total_timeout = validate_timeout(download_timeout, "download_timeout")
    active_disk_usage = disk_usage_fn if disk_usage_fn is not None else shutil.disk_usage

    if dest_path.exists() or dest_path.is_symlink():
        raise ValidationError(
            f"Refusing to overwrite existing local input path: {dest_path}"
        )

    usage_before = active_disk_usage(dest_path.parent)
    if usage_before.free <= 0:
        raise IngestError(
            f"Insufficient free disk space in '{dest_path.parent}' before download."
        )

    resolved_ips = resolve_and_validate_public_ips(hostname, resolver=resolver)
    pinned_family, pinned_ip = resolved_ips[0]

    context = ssl_context if ssl_context is not None else ssl.create_default_context()
    conn_cls = connection_factory if connection_factory is not None else _PinnedHTTPSConnection

    deadline = time.monotonic() + float(validated_total_timeout)
    partial_path = dest_path.parent / f".{dest_path.name}.{uuid.uuid4().hex}.part"
    own_partial_created = False
    conn: Any = None
    file_handle: Any = None

    try:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise IngestError(f"Download exceeded total timeout for {redacted_url}.")

        effective_timeout = min(float(validated_sock_timeout), remaining)
        try:
            conn = conn_cls(
                hostname,
                pinned_ip=pinned_ip,
                pinned_family=pinned_family,
                port=urlsplit(url).port or 443,
                timeout=effective_timeout,
                context=context,
            )
            conn.request(
                "GET",
                request_target,
                headers={
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                    "User-Agent": "pixel-media-ingest/1.0",
                    **safe_headers,
                },
            )
            response = conn.getresponse()
        except (TimeoutError, socket.timeout) as exc:
            raise IngestError(
                f"Download socket timeout for {redacted_url}."
            ) from exc
        except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
            raise IngestError(
                f"HTTPS download failed for {redacted_url}: {sanitize_text(str(exc))}"
            ) from exc

        status = int(response.status)
        if 300 <= status < 400:
            raise IngestError(
                f"HTTP redirects are disabled (received status {status}) for {redacted_url}."
            )
        if status != 200:
            raise IngestError(
                f"Unexpected HTTP status {status} for {redacted_url}."
            )

        raw_ctype = response.getheader("Content-Type") or ""
        media_type = raw_ctype.split(";", 1)[0].strip().lower()
        if media_type in _DISALLOWED_CONTENT_TYPES:
            raise IngestError(
                f"Disallowed Content-Type '{media_type}' for direct file download ({redacted_url})."
            )

        content_length: int | None = None
        raw_cl = response.getheader("Content-Length")
        if raw_cl is not None:
            try:
                content_length = int(raw_cl.strip())
            except ValueError as exc:
                raise IngestError(
                    f"Invalid Content-Length header for {redacted_url}."
                ) from exc
            if content_length <= 0:
                raise IngestError(
                    f"Remote file reported non-positive Content-Length ({content_length}) for {redacted_url}."
                )
            if content_length > validated_max_bytes:
                raise IngestError(
                    f"Remote file size ({content_length} bytes) exceeds limit ({validated_max_bytes} bytes) for {redacted_url}."
                )
            if active_disk_usage(dest_path.parent).free < content_length:
                raise IngestError(
                    f"Insufficient free disk space for {content_length} bytes in '{dest_path.parent}'."
                )

        fd = os.open(partial_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.fchmod(fd, 0o600)
        except OSError:
            pass
        own_partial_created = True
        file_handle = os.fdopen(fd, "wb")

        digest = hashlib.sha256()
        total_bytes = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise IngestError(
                    f"Download exceeded total timeout ({validated_total_timeout}s) for {redacted_url}."
                )
            sock = getattr(conn, "sock", None)
            if sock is not None and hasattr(sock, "settimeout"):
                sock.settimeout(min(float(validated_sock_timeout), remaining))

            try:
                chunk = response.read(DOWNLOAD_CHUNK_SIZE)
            except (TimeoutError, socket.timeout) as exc:
                raise IngestError(
                    f"Download read timed out for {redacted_url}."
                ) from exc
            except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
                raise IngestError(
                    f"Download stream interrupted for {redacted_url}: {sanitize_text(str(exc))}"
                ) from exc

            if not chunk:
                break
            if total_bytes + len(chunk) > validated_max_bytes:
                raise IngestError(
                    f"Download exceeded max size limit ({validated_max_bytes} bytes) for {redacted_url}."
                )
            try:
                file_handle.write(chunk)
            except OSError as exc:
                raise IngestError(
                    f"Failed writing partial download to '{partial_path}': {sanitize_text(str(exc))}"
                ) from exc
            digest.update(chunk)
            total_bytes += len(chunk)

        if total_bytes <= 0:
            raise IngestError(f"Downloaded file is empty (0 bytes) for {redacted_url}.")
        if content_length is not None and total_bytes != content_length:
            raise IngestError(
                f"Downloaded size ({total_bytes} bytes) does not match Content-Length ({content_length} bytes) for {redacted_url}."
            )

        file_handle.flush()
        os.fsync(file_handle.fileno())
        file_handle.close()
        file_handle = None

        _promote_partial_file(partial_path, dest_path)
        own_partial_created = False

        return DownloadResult(
            dest_path=dest_path,
            redacted_url=redacted_url,
            hostname=hostname,
            resolved_ip=pinned_ip,
            bytes_downloaded=total_bytes,
            sha256=digest.hexdigest(),
        )
    finally:
        if file_handle is not None:
            try:
                file_handle.close()
            except OSError:
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        if own_partial_created:
            try:
                partial_path.unlink(missing_ok=True)
            except OSError:
                pass
