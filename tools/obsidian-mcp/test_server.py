#!/usr/bin/env python3
"""Unit tests for confinement, size limits, and MCP stdio JSON-RPC protocol."""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import server  # noqa: E402


class ConfinementAndVaultTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "vault"
        self.root.mkdir()
        self.outside = Path(self.tmp.name) / "outside"
        self.outside.mkdir()
        (self.outside / "secret.md").write_text("top secret\n", encoding="utf-8")
        (self.outside / "secret.txt").write_text("plain secret\n", encoding="utf-8")

        (self.root / "index.md").write_text("# Index\n", encoding="utf-8")
        (self.root / "sub").mkdir()
        (self.root / "sub" / "nested.md").write_text("# Nested\n", encoding="utf-8")
        (self.root / "not_markdown.txt").write_text("ignored\n", encoding="utf-8")

        self.vault = server.ObsidianVault(self.root)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_default_vault_root_is_docs_brain(self) -> None:
        expected = Path(__file__).resolve().parents[2] / "docs" / "brain"
        self.assertEqual(server.default_vault_root(), expected)

    def test_rejects_traversal_and_absolute_paths(self) -> None:
        bad_paths = [
            "../outside/secret.md",
            "sub/../../outside/secret.md",
            "./index.md",
            "sub/./nested.md",
            "..\\outside\\secret.md",
            "/etc/passwd",
            "/tmp/note.md",
            "C:\\note.md",
            "C:note.md",
            "bad\x00path.md",
            "",
            "   ",
        ]
        for bad in bad_paths:
            with self.subTest(path=bad):
                with self.assertRaises(server.VaultError):
                    self.vault.read_note(bad)
                with self.assertRaises(server.VaultError):
                    self.vault.append_note(bad, "hello")

    def test_rejects_non_markdown_files(self) -> None:
        non_md = [
            "not_markdown.txt",
            ".env",
            "script.py",
            "README",
            ".md",
            "note.md.txt",
        ]
        for path in non_md:
            with self.subTest(path=path):
                with self.assertRaises(server.VaultError):
                    self.vault.read_note(path)
                with self.assertRaises(server.VaultError):
                    self.vault.append_note(path, "hello")

    def test_rejects_symlinks_and_skips_them_in_list(self) -> None:
        link_file = self.root / "link_secret.md"
        link_dir = self.root / "link_dir"
        try:
            os.symlink(self.outside / "secret.md", link_file)
            os.symlink(self.outside, link_dir)
        except OSError as exc:  # pragma: no cover - platform without symlink perms
            self.skipTest(f"Symlinks unavailable: {exc}")

        with self.assertRaises(server.VaultError):
            self.vault.read_note("link_secret.md")
        with self.assertRaises(server.VaultError):
            self.vault.append_note("link_secret.md", "injected")
        with self.assertRaises(server.VaultError):
            self.vault.read_note("link_dir/secret.md")
        with self.assertRaises(server.VaultError):
            self.vault.append_note("link_dir/new.md", "injected")
        with self.assertRaises(server.VaultError):
            self.vault.list_notes(subdir="link_dir")

        listed = self.vault.list_notes()
        listed_paths = [item["path"] for item in listed["notes"]]
        self.assertEqual(listed_paths, ["index.md", "sub/nested.md"])

    def test_rejects_symlink_vault_root(self) -> None:
        symlink_root = Path(self.tmp.name) / "vault_link"
        try:
            os.symlink(self.root, symlink_root)
        except OSError as exc:  # pragma: no cover
            self.skipTest(f"Symlinks unavailable: {exc}")

        vault = server.ObsidianVault(symlink_root)
        with self.assertRaises(server.VaultError):
            vault.list_notes()

    def test_size_limits_enforced(self) -> None:
        small_vault = server.ObsidianVault(
            self.root,
            max_list_notes=1,
            max_read_bytes=32,
            max_append_bytes=20,
            max_note_bytes=40,
        )
        listed = small_vault.list_notes()
        self.assertEqual(listed["count"], 1)
        self.assertTrue(listed["truncated"])

        (self.root / "big.md").write_text("x" * 64, encoding="utf-8")
        with self.assertRaises(server.VaultError):
            small_vault.read_note("big.md")

        with self.assertRaises(server.VaultError):
            small_vault.append_note("index.md", "a" * 21)

        # Existing "index.md" is 8 bytes; adding 19 + 19 + newline would exceed 40 bytes.
        small_vault.append_note("index.md", "a" * 18)
        with self.assertRaises(server.VaultError):
            small_vault.append_note("index.md", "b" * 18)

    def test_append_requires_explicit_content_and_does_not_execute(self) -> None:
        for empty in ("", "   ", "\n\t\n"):
            with self.subTest(content=repr(empty)):
                with self.assertRaises(server.VaultError):
                    self.vault.append_note("index.md", empty)

        payload = "Literal text: $(echo should_not_run) `uname -a` {{7*7}} __import__('os').system('id')"
        res = self.vault.append_note("decisions/log.md", payload)
        self.assertEqual(res["path"], "decisions/log.md")

        read_back = self.vault.read_note("decisions/log.md")
        self.assertEqual(read_back["content"], payload + "\n")

    def test_append_create_if_missing_false(self) -> None:
        with self.assertRaises(server.VaultError):
            self.vault.append_note("missing.md", "hello", create_if_missing=False)


class MCPProtocolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "brain"
        self.root.mkdir()
        (self.root / "index.md").write_text("# Index\n", encoding="utf-8")
        self.vault = server.ObsidianVault(self.root)
        self.mcp = server.MCPServer(self.vault)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_initialize_notification_ping_and_tools_list(self) -> None:
        init_resp = self.mcp.handle_message(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {}},
            }
        )
        self.assertIsNotNone(init_resp)
        assert init_resp is not None
        self.assertEqual(init_resp["id"], 1)
        self.assertEqual(init_resp["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(init_resp["result"]["serverInfo"]["name"], "obsidian-mcp")

        notif_resp = self.mcp.handle_message(
            {"jsonrpc": "2.0", "method": "notifications/initialized"}
        )
        self.assertIsNone(notif_resp)
        self.assertTrue(self.mcp.initialized)

        ping_resp = self.mcp.handle_message({"jsonrpc": "2.0", "id": 2, "method": "ping"})
        self.assertEqual(ping_resp, {"jsonrpc": "2.0", "id": 2, "result": {}})

        list_resp = self.mcp.handle_message({"jsonrpc": "2.0", "id": 3, "method": "tools/list"})
        assert list_resp is not None
        tool_names = [tool["name"] for tool in list_resp["result"]["tools"]]
        self.assertEqual(tool_names, ["list_notes", "read_note", "append_note"])

    def test_tools_call_and_error_handling(self) -> None:
        append_resp = self.mcp.handle_message(
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "tools/call",
                "params": {
                    "name": "append_note",
                    "arguments": {"path": "index.md", "content": "Confirmed decision."},
                },
            }
        )
        assert append_resp is not None
        self.assertFalse(append_resp["result"]["isError"])

        read_resp = self.mcp.handle_message(
            {
                "jsonrpc": "2.0",
                "id": 11,
                "method": "tools/call",
                "params": {"name": "read_note", "arguments": {"path": "index.md"}},
            }
        )
        assert read_resp is not None
        payload = json.loads(read_resp["result"]["content"][0]["text"])
        self.assertIn("Confirmed decision.", payload["content"])

        traversal_resp = self.mcp.handle_message(
            {
                "jsonrpc": "2.0",
                "id": 12,
                "method": "tools/call",
                "params": {"name": "read_note", "arguments": {"path": "../.env"}},
            }
        )
        assert traversal_resp is not None
        self.assertTrue(traversal_resp["result"]["isError"])

        unknown_method = self.mcp.handle_message(
            {"jsonrpc": "2.0", "id": 13, "method": "resources/list"}
        )
        assert unknown_method is not None
        self.assertEqual(unknown_method["error"]["code"], server.ERR_METHOD_NOT_FOUND)

        unknown_tool = self.mcp.handle_message(
            {
                "jsonrpc": "2.0",
                "id": 14,
                "method": "tools/call",
                "params": {"name": "delete_note", "arguments": {}},
            }
        )
        assert unknown_tool is not None
        self.assertEqual(unknown_tool["error"]["code"], server.ERR_INVALID_PARAMS)

    def test_serve_stdio_parse_error_and_oversized_line(self) -> None:
        oversized = "x" * (server.MAX_LINE_BYTES + 10)
        stdin = io.StringIO(f"not-json\n{oversized}\n")
        stdout = io.StringIO()
        self.mcp.serve_stdio(stdin=stdin, stdout=stdout)

        lines = stdout.getvalue().strip().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertEqual(json.loads(lines[0])["error"]["code"], server.ERR_PARSE)
        self.assertEqual(json.loads(lines[1])["error"]["code"], server.ERR_INVALID_REQUEST)

    def test_end_to_end_subprocess_stdio(self) -> None:
        requests = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "ping"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/list"},
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "list_notes", "arguments": {}},
            },
        ]
        stdin_data = "\n".join(json.dumps(req) for req in requests) + "\n"
        server_script = str(Path(__file__).resolve().parent / "server.py")

        proc = subprocess.run(
            [sys.executable, server_script, "--vault-root", str(self.root)],
            input=stdin_data,
            text=True,
            capture_output=True,
            check=True,
        )
        responses = [json.loads(line) for line in proc.stdout.strip().splitlines()]
        # 5 messages sent, 1 notification -> 4 responses expected
        self.assertEqual([resp["id"] for resp in responses], [1, 2, 3, 4])
        notes_payload = json.loads(responses[3]["result"]["content"][0]["text"])
        self.assertEqual(notes_payload["notes"][0]["path"], "index.md")


if __name__ == "__main__":
    unittest.main()
