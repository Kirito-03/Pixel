"""Input, path, symlink, remote, and output sanitization validators."""

from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import urlsplit

_URL_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_REMOTE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_SENSITIVE_QUERY_RE = re.compile(
    r"([?&](?:X-Amz-[^=&\s]+|Signature|AWSAccessKeyId|GoogleAccessId|token|access_token|refresh_token|key|auth)=)[^&\s]+",
    re.IGNORECASE,
)
_ANY_URL_QUERY_RE = re.compile(r"(https?://[^\s?#]+)\?[^\s#]+", re.IGNORECASE)
_CREDENTIAL_URL_RE = re.compile(r"(https?://)([^/\s:@]+)(?::([^/\s@]*))?@", re.IGNORECASE)
_BEARER_RE = re.compile(r"(Authorization\s*:\s*Bearer\s+)\S+", re.IGNORECASE)

MAX_TIMEOUT_SECONDS = 86400
MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB
DEFAULT_SOCKET_TIMEOUT = 30
DEFAULT_DOWNLOAD_TIMEOUT = 600
VALID_MODES = ("auto", "remux", "encode", "mediacodec")
VALID_DB_EXTENSIONS = (".db", ".sqlite", ".sqlite3")
MAX_RETRIES_LIMIT = 20


class ValidationError(ValueError):
    """Raised when CLI inputs, paths, or remotes fail safety validation."""


def sanitize_text(text: str) -> str:
    """Redact potential credentials, bearer tokens, or signed URL query parameters."""
    cleaned = _CREDENTIAL_URL_RE.sub(r"\1[REDACTED]:[REDACTED]@", text)
    cleaned = _ANY_URL_QUERY_RE.sub(r"\1?[REDACTED]", cleaned)
    cleaned = _SENSITIVE_QUERY_RE.sub(r"\1[REDACTED]", cleaned)
    cleaned = _BEARER_RE.sub(r"\1[REDACTED]", cleaned)
    return cleaned


def redact_url_for_log(url: str) -> str:
    """Return scheme://host/path with query, fragment, and credentials redacted."""
    try:
        parsed = urlsplit(url.strip())
    except ValueError:
        return "[REDACTED_URL]"
    if not parsed.scheme or not parsed.hostname:
        return "[REDACTED_URL]"
    host = parsed.hostname.strip().rstrip(".").lower()
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    path = parsed.path or "/"
    suffix = "?[REDACTED]" if parsed.query else ""
    return f"{parsed.scheme.lower()}://{host}{path}{suffix}"


def reject_url_or_unsafe_string(value: str, label: str) -> str:
    """Ensure a string is non-empty, free of control chars, and not a URL."""
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{label} must be a non-empty string.")
    if "\x00" in value or any(ord(ch) < 32 for ch in value):
        raise ValidationError(f"{label} contains invalid control characters.")
    stripped = value.strip()
    if _URL_SCHEME_RE.match(stripped):
        raise ValidationError(
            f"{label} appears to be a URL; URL downloads are not supported in this MVP."
        )
    return stripped


def ensure_no_symlinks(path: Path, label: str) -> None:
    """Reject symlinks on the target path and all of its ancestor components."""
    abs_like = Path(os.path.abspath(path))
    candidates = [abs_like, *abs_like.parents]
    for candidate in candidates:
        if candidate.is_symlink():
            raise ValidationError(
                f"{label} rejects symlinks for security: '{candidate}' is a symlink."
            )


def validate_allowed_root(allowed_root: str) -> Path:
    """Validate an optional confinement root directory."""
    cleaned = reject_url_or_unsafe_string(allowed_root, "allowed_root")
    root = Path(cleaned)
    ensure_no_symlinks(root, "allowed_root")
    abs_root = Path(os.path.abspath(root))
    if not abs_root.exists() or not abs_root.is_dir():
        raise ValidationError(f"allowed_root does not exist or is not a directory: {abs_root}")
    return abs_root


def _check_within_root(path: Path, root: Path | None, label: str) -> None:
    if root is None:
        return
    if not path.is_relative_to(root):
        raise ValidationError(
            f"{label} '{path}' escapes allowed_root '{root}'."
        )


def validate_input_file(input_path: str, allowed_root: Path | None = None) -> Path:
    """Validate an authorized local input media file."""
    cleaned = reject_url_or_unsafe_string(input_path, "input")
    raw = Path(cleaned)
    ensure_no_symlinks(raw, "input")
    abs_path = Path(os.path.abspath(raw))
    _check_within_root(abs_path, allowed_root, "input")
    if not abs_path.exists():
        raise ValidationError(f"Input file does not exist: {abs_path}")
    if not abs_path.is_file():
        raise ValidationError(f"Input path is not a regular file: {abs_path}")
    if abs_path.stat().st_size <= 0:
        raise ValidationError(f"Input file is empty: {abs_path}")
    return abs_path


def validate_output_file(
    output_path: str,
    input_abs: Path,
    allowed_root: Path | None = None,
) -> Path:
    """Validate the local MP4 output path without allowing symlinks or overwrites."""
    cleaned = reject_url_or_unsafe_string(output_path, "output")
    raw = Path(cleaned)
    ensure_no_symlinks(raw, "output")
    abs_out = Path(os.path.abspath(raw))
    _check_within_root(abs_out, allowed_root, "output")
    if abs_out.suffix.lower() != ".mp4":
        raise ValidationError(f"Output file must have a .mp4 extension: {abs_out}")
    if abs_out == input_abs:
        raise ValidationError("Output path cannot be the same as input path.")
    if abs_out.exists() or abs_out.is_symlink():
        raise ValidationError(
            f"Refusing to overwrite existing output path: {abs_out}"
        )
    parent = abs_out.parent
    if not parent.exists() or not parent.is_dir():
        raise ValidationError(f"Output parent directory does not exist: {parent}")
    return abs_out


def validate_manifest_path(
    manifest_path: str,
    input_abs: Path,
    output_abs: Path,
    allowed_root: Path | None = None,
) -> Path:
    """Validate the persistent JSON manifest path."""
    cleaned = reject_url_or_unsafe_string(manifest_path, "manifest")
    raw = Path(cleaned)
    ensure_no_symlinks(raw, "manifest")
    abs_manifest = Path(os.path.abspath(raw))
    _check_within_root(abs_manifest, allowed_root, "manifest")
    if abs_manifest == input_abs or abs_manifest == output_abs:
        raise ValidationError("Manifest path cannot match input or output path.")
    if abs_manifest.suffix.lower() != ".json":
        raise ValidationError(f"Manifest path must end with .json: {abs_manifest}")
    if abs_manifest.exists():
        if abs_manifest.is_dir():
            raise ValidationError(f"Manifest path is a directory: {abs_manifest}")
        raise ValidationError(
            f"Refusing to overwrite existing manifest file: {abs_manifest}"
        )
    parent = abs_manifest.parent
    if not parent.exists() or not parent.is_dir():
        raise ValidationError(f"Manifest parent directory does not exist: {parent}")
    return abs_manifest


def validate_remote_target(remote_target: str, output_abs: Path) -> tuple[str, str]:
    """Validate an explicit, pre-configured private rclone remote:path target."""
    cleaned = reject_url_or_unsafe_string(remote_target, "remote")
    if cleaned.startswith("-") or "@" in cleaned or "\\" in cleaned:
        raise ValidationError("Remote target contains disallowed characters (-, @, \\).")
    if any(ch.isspace() for ch in cleaned):
        raise ValidationError("Remote target must not contain whitespace.")
    if ":" not in cleaned:
        raise ValidationError(
            "Remote target must use explicit 'remote_name:path/to/file.mp4' syntax."
        )
    remote_name, remote_path = cleaned.split(":", 1)
    if not _REMOTE_NAME_RE.match(remote_name):
        raise ValidationError(
            f"Invalid rclone remote name '{remote_name}'. Expected pre-configured alphanumeric/dash/underscore name."
        )
    if not remote_path or remote_path.startswith("-") or remote_path.endswith("/"):
        raise ValidationError(
            "Remote path must be a non-empty file path (not a directory or flag)."
        )
    if ":" in remote_path:
        raise ValidationError("Remote path must not contain extra ':' characters.")
    parts = [p for p in remote_path.split("/") if p]
    if not parts or any(p in (".", "..") for p in parts):
        raise ValidationError("Remote path must not contain '.' or '..' traversal segments.")
    if not parts[-1].lower().endswith(".mp4"):
        raise ValidationError("Remote target file must end with .mp4.")
    if parts[-1] != output_abs.name:
        raise ValidationError(
            f"Remote filename '{parts[-1]}' must match local output filename '{output_abs.name}' for rclone check."
        )
    normalized_path = "/".join(parts)
    if remote_path.startswith("/"):
        normalized_path = "/" + normalized_path
    return remote_name, f"{remote_name}:{normalized_path}"


def validate_timeout(value: int, label: str) -> int:
    """Validate a positive subprocess timeout in seconds."""
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0 or value > MAX_TIMEOUT_SECONDS:
        raise ValidationError(
            f"{label} must be an integer between 1 and {MAX_TIMEOUT_SECONDS} seconds."
        )
    return value


def validate_mode(mode: str) -> str:
    """Validate processing mode (auto, remux, encode, or experimental mediacodec)."""
    if not isinstance(mode, str) or mode not in VALID_MODES:
        raise ValidationError(
            f"Invalid mode '{mode}'. Expected one of: {', '.join(VALID_MODES)}."
        )
    return mode


def validate_max_retries(value: int) -> int:
    """Validate non-negative retry limit."""
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > MAX_RETRIES_LIMIT:
        raise ValidationError(
            f"max_retries must be an integer between 0 and {MAX_RETRIES_LIMIT}."
        )
    return value


def validate_db_path(
    db_path: str,
    allowed_root: Path | None = None,
    *,
    must_exist: bool = False,
) -> Path:
    """Validate SQLite queue database path without allowing symlinks or escapes."""
    cleaned = reject_url_or_unsafe_string(db_path, "db")
    raw = Path(cleaned)
    ensure_no_symlinks(raw, "db")
    abs_db = Path(os.path.abspath(raw))
    _check_within_root(abs_db, allowed_root, "db")
    if abs_db.suffix.lower() not in VALID_DB_EXTENSIONS:
        raise ValidationError(
            f"Queue database path must end with one of {VALID_DB_EXTENSIONS}: {abs_db}"
        )
    if abs_db.exists():
        if abs_db.is_dir():
            raise ValidationError(f"Queue database path is a directory: {abs_db}")
    elif must_exist:
        raise ValidationError(f"Queue database does not exist: {abs_db}")
    parent = abs_db.parent
    if not parent.exists() or not parent.is_dir():
        raise ValidationError(f"Queue database parent directory does not exist: {parent}")
    return abs_db


def validate_allow_hosts(allow_hosts: list[str] | tuple[str, ...] | None) -> tuple[str, ...]:
    """Validate explicit repeatable --allow-host entries (no wildcards, ports, or paths)."""
    if not allow_hosts:
        raise ValidationError(
            "At least one explicit --allow-host is required for queue-add-url."
        )
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_host in allow_hosts:
        if not isinstance(raw_host, str) or not raw_host.strip():
            raise ValidationError("allow-host entries must be non-empty hostnames.")
        if "\x00" in raw_host or any(ord(ch) < 32 for ch in raw_host):
            raise ValidationError("allow-host contains invalid control characters.")
        if any(ch.isspace() for ch in raw_host):
            raise ValidationError("allow-host must not contain whitespace.")
        candidate = raw_host.strip()
        if candidate.startswith("[") and candidate.endswith("]"):
            candidate = candidate[1:-1]
        if any(ch in candidate for ch in ("/", "?", "#", "@", "*", "\\")):
            raise ValidationError(
                f"allow-host '{raw_host}' must be a plain hostname without scheme, port, path, or wildcards."
            )
        if "%" in candidate:
            raise ValidationError("allow-host must not contain zone identifiers.")
        if ":" in candidate and "." in candidate:
            raise ValidationError("allow-host must not include a port.")
        norm = candidate.rstrip(".").lower()
        if not norm:
            raise ValidationError("allow-host entry resolved to empty hostname.")
        if norm not in seen:
            seen.add(norm)
            normalized.append(norm)
    return tuple(normalized)


def validate_direct_https_url(
    url: str,
    allowed_hosts: tuple[str, ...],
    allowed_ports: tuple[int, ...] = (443,),
) -> tuple[str, str, str]:
    """Validate a direct HTTPS file URL against an explicit host allowlist.

    Returns (redacted_url, normalized_hostname, request_target).
    """
    if not isinstance(url, str) or not url.strip():
        raise ValidationError("url must be a non-empty string.")
    if "\x00" in url or any(ord(ch) < 32 for ch in url):
        raise ValidationError("url contains invalid control characters.")
    cleaned = url.strip()
    if any(ch.isspace() for ch in cleaned):
        raise ValidationError("url must not contain whitespace.")

    try:
        parsed = urlsplit(cleaned)
    except ValueError as exc:
        raise ValidationError("Invalid URL syntax.") from exc

    if parsed.scheme.lower() != "https":
        raise ValidationError("Only direct https:// URLs are supported.")
    if parsed.username is not None or parsed.password is not None or "@" in parsed.netloc:
        raise ValidationError("HTTPS URL must not contain embedded credentials.")
    if not parsed.hostname:
        raise ValidationError("HTTPS URL must include a valid hostname.")

    try:
        port = parsed.port
    except ValueError as exc:
        raise ValidationError("HTTPS URL contains an invalid port.") from exc
    if (port or 443) not in allowed_ports:
        raise ValidationError("Custom/special ports are not allowed; only standard HTTPS (443).")

    if parsed.fragment:
        raise ValidationError("URL fragments (#...) are not supported for direct file downloads.")

    hostname = parsed.hostname.strip().rstrip(".").lower()
    if "%" in hostname:
        raise ValidationError("HTTPS URL hostname must not contain zone identifiers.")
    if hostname not in allowed_hosts:
        raise ValidationError(
            f"Host '{hostname}' is not in the explicit --allow-host allowlist."
        )

    path = parsed.path or ""
    if not path or path == "/":
        raise ValidationError("HTTPS URL must point to a direct file path, not root '/'.")
    if path.lower().endswith(".m3u8"):
        raise ValidationError("HLS playlists (.m3u8) are not supported in this step.")

    request_target = f"{path}?{parsed.query}" if parsed.query else path
    return redact_url_for_log(cleaned), hostname, request_target


def validate_max_bytes(value: int) -> int:
    """Validate configurable download size limit up to 2 GiB."""
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value <= 0
        or value > MAX_DOWNLOAD_BYTES
    ):
        raise ValidationError(
            f"max_bytes must be an integer between 1 and {MAX_DOWNLOAD_BYTES} bytes (2 GiB)."
        )
    return value


def validate_download_destination(
    dest_path: str,
    allowed_root: Path | None = None,
) -> Path:
    """Validate local destination path for a new downloaded file (no symlinks, no overwrite)."""
    cleaned = reject_url_or_unsafe_string(dest_path, "input")
    raw = Path(cleaned)
    ensure_no_symlinks(raw, "input")
    abs_dest = Path(os.path.abspath(raw))
    _check_within_root(abs_dest, allowed_root, "input")
    if abs_dest.exists() or abs_dest.is_symlink():
        raise ValidationError(
            f"Refusing to overwrite existing local input path: {abs_dest}"
        )
    parent = abs_dest.parent
    if not parent.exists() or not parent.is_dir():
        raise ValidationError(f"Input parent directory does not exist: {parent}")
    return abs_dest
