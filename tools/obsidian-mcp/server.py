#!/usr/bin/env python3
"""Local stdio MCP server for Obsidian-style Markdown notes confined to a vault.

Implements newline-delimited JSON-RPC 2.0 over stdio for:
- initialize
- notifications/initialized
- ping
- tools/list
- tools/call (list_notes, read_note, append_note)

Uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import sys
from typing import Any, Callable, TextIO


SERVER_NAME = "obsidian-mcp"
SERVER_VERSION = "1.0.0"
DEFAULT_PROTOCOL_VERSION = "2024-11-05"

MAX_LINE_BYTES = 1024 * 1024  # 1 MiB max incoming JSON-RPC line
MAX_LIST_NOTES = 500
MAX_READ_BYTES = 256 * 1024  # 256 KiB
MAX_APPEND_BYTES = 64 * 1024  # 64 KiB
MAX_NOTE_BYTES = 512 * 1024  # 512 KiB total file size after append

JSONRPC_VERSION = "2.0"
ERR_PARSE = -32700
ERR_INVALID_REQUEST = -32600
ERR_METHOD_NOT_FOUND = -32601
ERR_INVALID_PARAMS = -32602
ERR_INTERNAL = -32603


class VaultError(Exception):
    """Domain or security validation error for vault operations."""


def default_vault_root() -> Path:
    """Return the default vault directory."""
    candidate = Path("/run/media/arle/Reze/Users/ASUS/My Documents/Projects")
    if candidate.exists() and candidate.is_dir():
        return candidate
    repo_root = Path(__file__).resolve().parents[2]
    return repo_root / "docs" / "brain"


def _reject_unsafe_relative_syntax(raw_path: str) -> list[str]:
    """Validate relative path string syntax and return normalized POSIX segments."""
    if not isinstance(raw_path, str):
        raise VaultError("Path must be a string.")
    if "\x00" in raw_path:
        raise VaultError("Path must not contain null bytes.")
    if "\\" in raw_path:
        raise VaultError("Backslashes are not allowed in vault paths.")
    if raw_path.startswith("/"):
        raise VaultError("Absolute paths are not allowed.")
    if PurePosixPath(raw_path).is_absolute() or PureWindowsPath(raw_path).is_absolute():
        raise VaultError("Absolute paths are not allowed.")
    # Reject Windows drive prefixes such as "C:foo.md"
    if len(raw_path) >= 2 and raw_path[1] == ":" and raw_path[0].isalpha():
        raise VaultError("Drive-qualified paths are not allowed.")

    parts = [part for part in raw_path.split("/") if part != ""]
    for part in parts:
        if part in (".", ".."):
            raise VaultError("Path traversal segments ('.' or '..') are not allowed.")
    return parts


def _ensure_vault_root(vault_root: Path) -> Path:
    """Verify the vault root is a real directory (not a symlink) and return resolved path."""
    if vault_root.is_symlink():
        raise VaultError("Vault root must not be a symlink.")
    if not vault_root.exists():
        raise VaultError("Vault root directory does not exist.")
    if not vault_root.is_dir():
        raise VaultError("Vault root must be a directory.")
    return vault_root.resolve(strict=True)


def _check_no_symlinks_along_path(root_resolved: Path, parts: list[str]) -> Path:
    """Walk each component from root_resolved, rejecting any existing symlink."""
    current = root_resolved
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise VaultError(f"Symlinks are not allowed: {part}")
    return current


def resolve_markdown_path(
    vault_root: Path,
    raw_path: str,
    *,
    must_exist: bool,
) -> Path:
    """Resolve a relative .md path safely inside vault_root."""
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise VaultError("Note path must be a non-empty string.")
    parts = _reject_unsafe_relative_syntax(raw_path)
    if not parts:
        raise VaultError("Note path must point to a .md file.")

    filename = parts[-1]
    if not filename.endswith(".md") or filename == ".md":
        raise VaultError("Only .md files are allowed.")

    root_resolved = _ensure_vault_root(vault_root)
    candidate = _check_no_symlinks_along_path(root_resolved, parts)

    if must_exist:
        if not candidate.exists():
            raise VaultError("Note does not exist.")
        if not candidate.is_file():
            raise VaultError("Target path is not a regular file.")
        resolved = candidate.resolve(strict=True)
    else:
        if candidate.exists() and not candidate.is_file():
            raise VaultError("Target path is not a regular file.")
        resolved = candidate.parent.resolve(strict=False) / candidate.name

    if not resolved.is_relative_to(root_resolved):
        raise VaultError("Resolved path escapes the vault root.")
    return resolved


def resolve_subdir_path(vault_root: Path, raw_subdir: str | None) -> tuple[Path, Path]:
    """Resolve an optional relative subdirectory inside vault_root."""
    root_resolved = _ensure_vault_root(vault_root)
    if raw_subdir is None or raw_subdir == "":
        return root_resolved, root_resolved

    parts = _reject_unsafe_relative_syntax(raw_subdir)
    candidate = _check_no_symlinks_along_path(root_resolved, parts)
    if not candidate.exists():
        raise VaultError("Subdirectory does not exist.")
    if not candidate.is_dir():
        raise VaultError("Subdirectory path is not a directory.")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_relative_to(root_resolved):
        raise VaultError("Resolved subdirectory escapes the vault root.")
    return root_resolved, resolved


def _open_read_nofollow(path: Path) -> int:
    """Open a file read-only without following symlinks when supported."""
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    return os.open(path, flags)


def _open_append_nofollow(path: Path) -> int:
    """Open/create a file for append without following symlinks when supported."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    return os.open(path, flags, 0o644)


class ObsidianVault:
    """Confined Markdown vault operations for docs/brain."""

    def __init__(
        self,
        root: Path,
        *,
        max_list_notes: int = MAX_LIST_NOTES,
        max_read_bytes: int = MAX_READ_BYTES,
        max_append_bytes: int = MAX_APPEND_BYTES,
        max_note_bytes: int = MAX_NOTE_BYTES,
    ) -> None:
        self.root = root
        self.max_list_notes = max_list_notes
        self.max_read_bytes = max_read_bytes
        self.max_append_bytes = max_append_bytes
        self.max_note_bytes = max_note_bytes

    def list_notes(
        self,
        *,
        subdir: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """List .md notes under the vault (or an optional subdirectory)."""
        if limit is not None:
            if isinstance(limit, bool) or not isinstance(limit, int) or limit <= 0:
                raise VaultError("limit must be a positive integer.")
            effective_limit = min(limit, self.max_list_notes)
        else:
            effective_limit = self.max_list_notes

        root_resolved, target_dir = resolve_subdir_path(self.root, subdir)
        notes: list[dict[str, Any]] = []
        truncated = False

        # Manual stack traversal so we never follow symlinks and can sort deterministically.
        stack: list[Path] = [target_dir]
        while stack:
            current_dir = stack.pop(0)
            try:
                entries = sorted(current_dir.iterdir(), key=lambda p: p.name)
            except OSError as exc:
                raise VaultError(f"Failed to list directory: {exc}") from exc

            subdirs: list[Path] = []
            for entry in entries:
                if entry.is_symlink():
                    continue
                if entry.is_dir():
                    subdirs.append(entry)
                elif entry.is_file() and entry.name.endswith(".md") and entry.name != ".md":
                    rel = entry.resolve(strict=True).relative_to(root_resolved).as_posix()
                    size_bytes = entry.stat().st_size
                    notes.append({"path": rel, "size_bytes": size_bytes})
                    if len(notes) >= effective_limit:
                        truncated = True
                        break
            if truncated:
                break
            stack = subdirs + stack

        notes.sort(key=lambda item: item["path"])
        return {
            "notes": notes,
            "count": len(notes),
            "truncated": truncated,
        }

    def read_note(self, path: str) -> dict[str, Any]:
        """Read a .md note inside the vault within size limits."""
        target = resolve_markdown_path(self.root, path, must_exist=True)
        root_resolved = self.root.resolve(strict=True)
        rel_path = target.relative_to(root_resolved).as_posix()

        try:
            fd = _open_read_nofollow(target)
        except OSError as exc:
            raise VaultError(f"Unable to open note safely: {exc}") from exc

        try:
            stat_info = os.fstat(fd)
            if stat_info.st_size > self.max_read_bytes:
                raise VaultError(
                    f"Note exceeds maximum read size ({self.max_read_bytes} bytes)."
                )
            with os.fdopen(fd, "rb") as handle:
                raw = handle.read(self.max_read_bytes + 1)
        except VaultError:
            raise
        except OSError as exc:
            raise VaultError(f"Failed to read note: {exc}") from exc

        if len(raw) > self.max_read_bytes:
            raise VaultError(
                f"Note exceeds maximum read size ({self.max_read_bytes} bytes)."
            )

        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise VaultError("Note is not valid UTF-8 text.") from exc

        return {
            "path": rel_path,
            "size_bytes": len(raw),
            "content": content,
        }

    def append_note(
        self,
        path: str,
        content: str,
        *,
        create_if_missing: bool = True,
    ) -> dict[str, Any]:
        """Append explicit plain-text content to a .md note without executing it."""
        if not isinstance(content, str) or not content.strip():
            raise VaultError("append_note requires explicit non-empty string content.")
        if not isinstance(create_if_missing, bool):
            raise VaultError("create_if_missing must be a boolean.")

        payload_bytes = content.encode("utf-8")
        if len(payload_bytes) > self.max_append_bytes:
            raise VaultError(
                f"Append content exceeds maximum size ({self.max_append_bytes} bytes)."
            )

        target = resolve_markdown_path(
            self.root,
            path,
            must_exist=not create_if_missing,
        )
        root_resolved = self.root.resolve(strict=True)

        # Safely create missing parent directories inside the already-verified root.
        parent = target.parent
        if not parent.exists():
            rel_parent_parts = parent.relative_to(root_resolved).parts
            cur = root_resolved
            for part in rel_parent_parts:
                cur = cur / part
                if cur.is_symlink():
                    raise VaultError(f"Symlinks are not allowed: {part}")
                if not cur.exists():
                    cur.mkdir(mode=0o755)
                elif not cur.is_dir():
                    raise VaultError("Parent path component is not a directory.")

        existing_size = 0
        needs_leading_newline = False
        if target.exists():
            try:
                rfd = _open_read_nofollow(target)
                with os.fdopen(rfd, "rb") as handle:
                    stat_info = os.fstat(handle.fileno())
                    existing_size = stat_info.st_size
                    if existing_size > 0:
                        handle.seek(max(0, existing_size - 1))
                        last_byte = handle.read(1)
                        needs_leading_newline = last_byte != b"\n"
            except OSError as exc:
                raise VaultError(f"Failed to inspect existing note: {exc}") from exc

        to_write = (b"\n" if needs_leading_newline else b"") + payload_bytes
        if not to_write.endswith(b"\n"):
            to_write += b"\n"

        if existing_size + len(to_write) > self.max_note_bytes:
            raise VaultError(
                f"Resulting note exceeds maximum size ({self.max_note_bytes} bytes)."
            )

        try:
            wfd = _open_append_nofollow(target)
            with os.fdopen(wfd, "ab") as handle:
                handle.write(to_write)
                handle.flush()
        except OSError as exc:
            raise VaultError(f"Failed to append to note: {exc}") from exc

        rel_path = target.resolve(strict=True).relative_to(root_resolved).as_posix()
        return {
            "path": rel_path,
            "appended_bytes": len(to_write),
            "total_bytes": existing_size + len(to_write),
        }

    def write_note(
        self,
        path: str,
        content: str,
        *,
        overwrite: bool = True,
    ) -> dict[str, Any]:
        """Write or overwrite explicit plain-text content to a .md note."""
        if not isinstance(content, str):
            raise VaultError("write_note requires explicit string content.")
        if not isinstance(overwrite, bool):
            raise VaultError("overwrite must be a boolean.")

        payload_bytes = content.encode("utf-8")
        if len(payload_bytes) > self.max_note_bytes:
            raise VaultError(
                f"Content exceeds maximum note size ({self.max_note_bytes} bytes)."
            )

        target = resolve_markdown_path(
            self.root,
            path,
            must_exist=False,
        )
        root_resolved = self.root.resolve(strict=True)

        if target.exists() and not overwrite:
            raise VaultError(f"Note already exists and overwrite is False: {path}")

        parent = target.parent
        if not parent.exists():
            rel_parent_parts = parent.relative_to(root_resolved).parts
            cur = root_resolved
            for part in rel_parent_parts:
                cur = cur / part
                if cur.is_symlink():
                    raise VaultError(f"Symlinks are not allowed: {part}")
                if not cur.exists():
                    cur.mkdir(mode=0o755)
                elif not cur.is_dir():
                    raise VaultError("Parent path component is not a directory.")

        to_write = payload_bytes
        if not to_write.endswith(b"\n") and to_write:
            to_write += b"\n"

        try:
            flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            fd = os.open(target, flags, 0o644)
            with os.fdopen(fd, "wb") as handle:
                handle.write(to_write)
                handle.flush()
        except OSError as exc:
            raise VaultError(f"Failed to write note: {exc}") from exc

        rel_path = target.resolve(strict=True).relative_to(root_resolved).as_posix()
        return {
            "path": rel_path,
            "written_bytes": len(to_write),
        }

    def search_notes(
        self,
        query: str,
        *,
        subdir: str | None = None,
        case_sensitive: bool = False,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Search markdown notes for a query string, returning snippets with line numbers."""
        if not isinstance(query, str) or not query.strip():
            raise VaultError("Query must be a non-empty string.")

        list_res = self.list_notes(subdir=subdir, limit=MAX_LIST_NOTES)
        notes = list_res["notes"]
        effective_limit = max(1, min(limit, 200))
        results = []

        q = query if case_sensitive else query.lower()

        for item in notes:
            note_path = item["path"]
            try:
                data = self.read_note(note_path)
                lines = data["content"].splitlines()
                matches = []
                for idx, line in enumerate(lines, start=1):
                    target_line = line if case_sensitive else line.lower()
                    if q in target_line:
                        matches.append({
                            "line": idx,
                            "text": line.strip()[:200],
                        })
                        if len(matches) >= 5:
                            break
                if matches:
                    results.append({
                        "path": note_path,
                        "match_count": len(matches),
                        "matches": matches,
                    })
                    if len(results) >= effective_limit:
                        break
            except Exception:
                continue

        return {
            "query": query,
            "count": len(results),
            "results": results,
        }

    def get_vault_stats(self) -> dict[str, Any]:
        """Return summary statistics of the vault."""
        list_res = self.list_notes(limit=MAX_LIST_NOTES)
        notes = list_res["notes"]
        total_size = sum(n["size_bytes"] for n in notes)
        root_resolved = self.root.resolve(strict=True)

        top_dirs = []
        try:
            for entry in sorted(root_resolved.iterdir()):
                if entry.is_dir() and not entry.is_symlink() and not entry.name.startswith("."):
                    top_dirs.append(entry.name)
        except Exception:
            pass

        return {
            "vault_root": str(root_resolved),
            "total_notes": len(notes),
            "total_bytes": total_size,
            "top_level_folders": top_dirs,
        }


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_notes",
        "description": "List Markdown (.md) notes inside the Obsidian vault.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "subdir": {
                    "type": "string",
                    "description": "Optional relative subdirectory inside the vault (e.g. 'Pixel' or 'Muvixo').",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_LIST_NOTES,
                    "description": f"Maximum number of notes to return (default/max {MAX_LIST_NOTES}).",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "read_note",
        "description": "Read a Markdown (.md) note inside the vault.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to a .md note inside the vault (e.g. '00_CENTRO_DE_PROYECTOS.md' or 'Pixel/00_PIXEL.md').",
                },
            },
            "required": ["path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "write_note",
        "description": "Create or overwrite a Markdown (.md) note inside the vault. Creates subdirectories automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to a .md note inside the vault.",
                },
                "content": {
                    "type": "string",
                    "description": "Full Markdown content to write.",
                },
                "overwrite": {
                    "type": "boolean",
                    "description": "Whether to overwrite if the file already exists (default true).",
                },
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        },
    },
    {
        "name": "append_note",
        "description": "Append text content to a Markdown (.md) note inside the vault.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to a .md note inside the vault.",
                },
                "content": {
                    "type": "string",
                    "description": "Explicit non-empty text content to append.",
                },
                "create_if_missing": {
                    "type": "boolean",
                    "description": "Whether to create the .md note if it does not exist (default true).",
                },
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_notes",
        "description": "Search notes inside the vault by keyword, returning matching paths, lines and text snippets.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search text to look for.",
                },
                "subdir": {
                    "type": "string",
                    "description": "Optional subdirectory to narrow the search.",
                },
                "case_sensitive": {
                    "type": "boolean",
                    "description": "Whether the search is case-sensitive (default false).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max matching notes to return (default 50).",
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_vault_stats",
        "description": "Get summary statistics of the Obsidian vault (total notes, size, top-level folders).",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    },
]


class MCPServer:
    """Newline-delimited JSON-RPC 2.0 MCP server."""

    def __init__(self, vault: ObsidianVault) -> None:
        self.vault = vault
        self.initialized = False
        self._tool_handlers: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
            "list_notes": self._call_list_notes,
            "read_note": self._call_read_note,
            "write_note": self._call_write_note,
            "append_note": self._call_append_note,
            "search_notes": self._call_search_notes,
            "get_vault_stats": self._call_get_vault_stats,
        }

    def _call_list_notes(self, args: dict[str, Any]) -> dict[str, Any]:
        allowed = {"subdir", "limit"}
        extra = set(args.keys()) - allowed
        if extra:
            raise VaultError(f"Unexpected arguments: {', '.join(sorted(extra))}")
        return self.vault.list_notes(
            subdir=args.get("subdir"),
            limit=args.get("limit"),
        )

    def _call_read_note(self, args: dict[str, Any]) -> dict[str, Any]:
        allowed = {"path"}
        extra = set(args.keys()) - allowed
        if extra:
            raise VaultError(f"Unexpected arguments: {', '.join(sorted(extra))}")
        if "path" not in args:
            raise VaultError("Missing required argument: path")
        return self.vault.read_note(args["path"])

    def _call_write_note(self, args: dict[str, Any]) -> dict[str, Any]:
        allowed = {"path", "content", "overwrite"}
        extra = set(args.keys()) - allowed
        if extra:
            raise VaultError(f"Unexpected arguments: {', '.join(sorted(extra))}")
        if "path" not in args:
            raise VaultError("Missing required argument: path")
        if "content" not in args:
            raise VaultError("Missing required argument: content")
        return self.vault.write_note(
            args["path"],
            args["content"],
            overwrite=args.get("overwrite", True),
        )

    def _call_append_note(self, args: dict[str, Any]) -> dict[str, Any]:
        allowed = {"path", "content", "create_if_missing"}
        extra = set(args.keys()) - allowed
        if extra:
            raise VaultError(f"Unexpected arguments: {', '.join(sorted(extra))}")
        if "path" not in args:
            raise VaultError("Missing required argument: path")
        if "content" not in args:
            raise VaultError("Missing required argument: content")
        return self.vault.append_note(
            args["path"],
            args["content"],
            create_if_missing=args.get("create_if_missing", True),
        )

    def _call_search_notes(self, args: dict[str, Any]) -> dict[str, Any]:
        allowed = {"query", "subdir", "case_sensitive", "limit"}
        extra = set(args.keys()) - allowed
        if extra:
            raise VaultError(f"Unexpected arguments: {', '.join(sorted(extra))}")
        if "query" not in args:
            raise VaultError("Missing required argument: query")
        return self.vault.search_notes(
            args["query"],
            subdir=args.get("subdir"),
            case_sensitive=args.get("case_sensitive", False),
            limit=args.get("limit", 50),
        )

    def _call_get_vault_stats(self, args: dict[str, Any]) -> dict[str, Any]:
        if args:
            raise VaultError("get_vault_stats accepts no arguments.")
        return self.vault.get_vault_stats()

    @staticmethod
    def _error_response(req_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": JSONRPC_VERSION,
            "id": req_id,
            "error": {"code": code, "message": message},
        }

    @staticmethod
    def _result_response(req_id: Any, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "jsonrpc": JSONRPC_VERSION,
            "id": req_id,
            "result": result,
        }

    def handle_message(self, message: Any) -> dict[str, Any] | None:
        """Process one decoded JSON-RPC message. Returns response dict or None for notifications."""
        if not isinstance(message, dict):
            return self._error_response(None, ERR_INVALID_REQUEST, "Request must be a JSON object.")

        if message.get("jsonrpc") != JSONRPC_VERSION:
            return self._error_response(
                message.get("id"),
                ERR_INVALID_REQUEST,
                "Invalid jsonrpc version; expected '2.0'.",
            )

        method = message.get("method")
        if not isinstance(method, str) or not method:
            return self._error_response(
                message.get("id"),
                ERR_INVALID_REQUEST,
                "Method must be a non-empty string.",
            )

        has_id = "id" in message
        req_id = message.get("id")
        params = message.get("params", {})
        if params is None:
            params = {}
        if not isinstance(params, dict):
            if not has_id:
                return None
            return self._error_response(req_id, ERR_INVALID_PARAMS, "params must be an object.")

        # Notifications have no "id" and must not receive a response.
        if not has_id:
            if method == "notifications/initialized":
                self.initialized = True
            return None

        if method == "initialize":
            client_version = params.get("protocolVersion")
            protocol_version = (
                client_version
                if isinstance(client_version, str) and client_version
                else DEFAULT_PROTOCOL_VERSION
            )
            return self._result_response(
                req_id,
                {
                    "protocolVersion": protocol_version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {
                        "name": SERVER_NAME,
                        "version": SERVER_VERSION,
                    },
                },
            )

        if method == "ping":
            return self._result_response(req_id, {})

        if method == "tools/list":
            return self._result_response(req_id, {"tools": TOOL_DEFINITIONS})

        if method == "tools/call":
            tool_name = params.get("name")
            if not isinstance(tool_name, str) or not tool_name:
                return self._error_response(req_id, ERR_INVALID_PARAMS, "Missing tool name.")
            handler = self._tool_handlers.get(tool_name)
            if handler is None:
                return self._error_response(req_id, ERR_INVALID_PARAMS, f"Unknown tool: {tool_name}")

            arguments = params.get("arguments", {})
            if arguments is None:
                arguments = {}
            if not isinstance(arguments, dict):
                return self._error_response(
                    req_id,
                    ERR_INVALID_PARAMS,
                    "Tool arguments must be an object.",
                )

            try:
                payload = handler(arguments)
                return self._result_response(
                    req_id,
                    {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(payload, ensure_ascii=False, indent=2),
                            }
                        ],
                        "isError": False,
                    },
                )
            except VaultError as exc:
                return self._result_response(
                    req_id,
                    {
                        "content": [{"type": "text", "text": str(exc)}],
                        "isError": True,
                    },
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                return self._error_response(req_id, ERR_INTERNAL, f"Internal error: {exc}")

        return self._error_response(req_id, ERR_METHOD_NOT_FOUND, f"Method not found: {method}")

    def serve_stdio(self, stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
        """Read newline-delimited JSON-RPC requests from stdin and write responses to stdout."""
        while True:
            line = stdin.readline()
            if line == "":
                break
            stripped = line.strip()
            if not stripped:
                continue

            if len(line.encode("utf-8")) > MAX_LINE_BYTES:
                resp = self._error_response(
                    None,
                    ERR_INVALID_REQUEST,
                    f"Request line exceeds maximum size ({MAX_LINE_BYTES} bytes).",
                )
                stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                stdout.flush()
                continue

            try:
                message = json.loads(stripped)
            except json.JSONDecodeError as exc:
                resp = self._error_response(None, ERR_PARSE, f"Parse error: {exc.msg}")
                stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                stdout.flush()
                continue

            response = self.handle_message(message)
            if response is not None:
                stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                stdout.flush()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Local stdio MCP server for Obsidian Markdown notes in docs/brain."
    )
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=default_vault_root(),
        help="Path to the confined Markdown vault directory (default: <repo>/docs/brain).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    vault = ObsidianVault(args.vault_root)
    server = MCPServer(vault)
    server.serve_stdio()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
