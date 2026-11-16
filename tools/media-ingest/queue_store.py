"""Persistent SQLite batch queue and single-worker flock coordinator."""

from __future__ import annotations

import fcntl
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from ingest import (
    IngestError,
    compute_sha256,
    run_ingest,
    upload_and_verify_output,
    validate_and_build_config,
)
from manifest import IngestManifest, profile_for_mode, utc_now_iso
from url_download import download_https_file
from validators import (
    DEFAULT_DOWNLOAD_TIMEOUT,
    DEFAULT_SOCKET_TIMEOUT,
    MAX_DOWNLOAD_BYTES,
    ValidationError,
    ensure_no_symlinks,
    sanitize_text,
    validate_allow_hosts,
    validate_allowed_root,
    validate_db_path,
    validate_direct_https_url,
    validate_download_destination,
    validate_input_file,
    validate_manifest_path,
    validate_max_bytes,
    validate_max_retries,
    validate_mode,
    validate_output_file,
    validate_remote_target,
    validate_timeout,
)

QUEUE_STATES = ("queued", "running", "encoded", "ready", "failed")


class WorkerLockError(RuntimeError):
    """Raised when another queue-run worker already holds the exclusive lock."""


@contextmanager
def acquire_worker_lock(db_path: Path) -> Iterator[Path]:
    """Acquire an exclusive non-blocking flock on <db_path>.lock."""
    lock_path = Path(f"{db_path}.lock")
    ensure_no_symlinks(lock_path, "worker_lock")
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise WorkerLockError(
                f"Another worker is already running on queue '{db_path}'."
            ) from exc

        os.ftruncate(fd, 0)
        os.write(fd, f"{os.getpid()}\n".encode("ascii"))
        yield lock_path
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        os.close(fd)


def _connect_db(db_path: Path) -> sqlite3.Connection:
    """Open SQLite connection with WAL mode and explicit transaction control."""
    conn = sqlite3.connect(str(db_path), timeout=5.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute("PRAGMA foreign_keys=ON;")
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create the ingest_jobs table and indexes if they do not exist."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ingest_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL UNIQUE,
            input_path TEXT NOT NULL,
            output_path TEXT NOT NULL UNIQUE,
            manifest_path TEXT NOT NULL UNIQUE,
            remote_target TEXT,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 2,
            mode_applied TEXT,
            last_error TEXT,
            worker_pid INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT
        );
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_attempts_id
        ON ingest_jobs (status, attempts, id);
        """
    )


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "input_path": row["input_path"],
        "output_path": row["output_path"],
        "manifest_path": row["manifest_path"],
        "remote_target": row["remote_target"],
        "mode": row["mode"],
        "status": row["status"],
        "attempts": row["attempts"],
        "max_retries": row["max_retries"],
        "mode_applied": row["mode_applied"],
        "last_error": row["last_error"],
        "worker_pid": row["worker_pid"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }


def enqueue_job(
    *,
    db_path: str,
    input_path: str,
    output_path: str,
    manifest_path: str,
    remote_target: str | None = None,
    mode: str = "auto",
    max_retries: int = 2,
    allowed_root: str | None = None,
) -> dict[str, Any]:
    """Validate and persist a new job into the SQLite queue."""
    root_abs = validate_allowed_root(allowed_root) if allowed_root else None
    db_abs = validate_db_path(db_path, allowed_root=root_abs, must_exist=False)
    validated_mode = validate_mode(mode)
    validated_retries = validate_max_retries(max_retries)

    cfg = validate_and_build_config(
        input_path=input_path,
        output_path=output_path,
        manifest_path=manifest_path,
        remote_target=remote_target,
        allowed_root=str(root_abs) if root_abs is not None else None,
        mode=validated_mode,
    )

    now = utc_now_iso()
    job_id = uuid.uuid4().hex
    conn = _connect_db(db_abs)
    try:
        conn.execute("BEGIN IMMEDIATE;")
        try:
            cursor = conn.execute(
                """
                INSERT INTO ingest_jobs (
                    job_id, input_path, output_path, manifest_path,
                    remote_target, mode, status, attempts, max_retries,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?);
                """,
                (
                    job_id,
                    str(cfg.input_path),
                    str(cfg.output_path),
                    str(cfg.manifest_path),
                    cfg.remote_target,
                    cfg.mode,
                    validated_retries,
                    now,
                    now,
                ),
            )
            conn.execute("COMMIT;")
        except sqlite3.IntegrityError as exc:
            conn.execute("ROLLBACK;")
            raise ValidationError(
                f"Queue already contains a job with the same output or manifest path: {sanitize_text(str(exc))}"
            ) from exc

        row = conn.execute(
            "SELECT * FROM ingest_jobs WHERE id = ?;", (cursor.lastrowid,)
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def enqueue_url_job(
    *,
    db_path: str,
    url: str,
    allow_hosts: list[str] | tuple[str, ...],
    input_path: str,
    output_path: str,
    manifest_path: str,
    remote_target: str | None = None,
    mode: str = "auto",
    max_retries: int = 2,
    allowed_root: str | None = None,
    max_bytes: int = MAX_DOWNLOAD_BYTES,
    socket_timeout: int = DEFAULT_SOCKET_TIMEOUT,
    download_timeout: int = DEFAULT_DOWNLOAD_TIMEOUT,
    download_fn: Any = download_https_file,
    allowed_ports: tuple[int, ...] = (443,),
) -> dict[str, Any]:
    """Download a direct HTTPS file safely and enqueue it using enqueue_job (queue-add).

    If enqueue_job fails after download completes, the complete downloaded file at
    input_path is intentionally preserved for manual review.
    """
    root_abs = validate_allowed_root(allowed_root) if allowed_root else None
    validate_db_path(db_path, allowed_root=root_abs, must_exist=False)
    validate_mode(mode)
    validate_max_retries(max_retries)
    dest_abs = validate_download_destination(input_path, allowed_root=root_abs)
    output_abs = validate_output_file(output_path, dest_abs, allowed_root=root_abs)
    validate_manifest_path(manifest_path, dest_abs, output_abs, allowed_root=root_abs)
    if remote_target is not None:
        validate_remote_target(remote_target, output_abs)

    normalized_hosts = validate_allow_hosts(allow_hosts)
    validate_direct_https_url(url, normalized_hosts, allowed_ports)
    validated_max_bytes = validate_max_bytes(max_bytes)
    validated_sock_timeout = validate_timeout(socket_timeout, "socket_timeout")
    validated_total_timeout = validate_timeout(download_timeout, "download_timeout")

    dl_result = download_fn(
        url=url,
        allow_hosts=normalized_hosts,
        dest_path=dest_abs,
        **({"allowed_ports": allowed_ports} if allowed_ports != (443,) else {}),
        max_bytes=validated_max_bytes,
        socket_timeout=validated_sock_timeout,
        download_timeout=validated_total_timeout,
    )

    job = enqueue_job(
        db_path=db_path,
        input_path=str(dest_abs),
        output_path=output_path,
        manifest_path=manifest_path,
        remote_target=remote_target,
        mode=mode,
        max_retries=max_retries,
        allowed_root=str(root_abs) if root_abs is not None else None,
    )
    job["download"] = {
        "url": dl_result.redacted_url,
        "resolved_ip": dl_result.resolved_ip,
        "bytes_downloaded": dl_result.bytes_downloaded,
        "sha256": dl_result.sha256,
    }
    return job


def list_jobs(
    *,
    db_path: str,
    status: str | None = None,
    allowed_root: str | None = None,
) -> dict[str, Any]:
    """List jobs and status counts from the SQLite queue."""
    root_abs = validate_allowed_root(allowed_root) if allowed_root else None
    db_abs = validate_db_path(db_path, allowed_root=root_abs, must_exist=True)
    if status is not None and status not in QUEUE_STATES:
        raise ValidationError(
            f"Invalid queue status '{status}'. Expected one of: {', '.join(QUEUE_STATES)}."
        )

    conn = _connect_db(db_abs)
    try:
        counts = {state: 0 for state in QUEUE_STATES}
        for row in conn.execute(
            "SELECT status, COUNT(*) AS cnt FROM ingest_jobs GROUP BY status;"
        ).fetchall():
            counts[row["status"]] = int(row["cnt"])

        if status is not None:
            rows = conn.execute(
                "SELECT * FROM ingest_jobs WHERE status = ? ORDER BY id ASC;",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM ingest_jobs ORDER BY id ASC;").fetchall()

        return {
            "db": str(db_abs),
            "counts": counts,
            "jobs": [_row_to_dict(r) for r in rows],
        }
    finally:
        conn.close()


def _safe_unlink_partial_artifact(path: Path) -> None:
    """Remove a partial output/manifest artifact (never the original input)."""
    if path.exists() and not path.is_symlink() and path.is_file():
        path.unlink()


def _load_valid_encoded_manifest(
    manifest_path: Path, output_path: Path
) -> dict[str, Any] | None:
    """Return parsed manifest dict if output_path exists and matches manifest sha256."""
    if (
        manifest_path.is_symlink()
        or output_path.is_symlink()
        or not manifest_path.is_file()
        or not output_path.is_file()
    ):
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if (data.get("profile") or {}).get("output_video_codec") != "av1":
        return None
    output_info = data.get("output")
    if not isinstance(output_info, dict):
        return None
    expected_sha = output_info.get("sha256")
    if not isinstance(expected_sha, str) or len(expected_sha) != 64:
        return None
    actual_sha, _ = compute_sha256(output_path)
    if actual_sha != expected_sha:
        return None
    return data


def _reconstruct_manifest(data: dict[str, Any]) -> IngestManifest:
    """Reconstruct IngestManifest from a verified encoded manifest dictionary."""
    source = data.get("source", {})
    output = data.get("output", {})
    remote = data.get("remote")
    mode = data.get("mode") if isinstance(data.get("mode"), dict) else {}
    manifest = IngestManifest(
        source_path=str(source.get("path", "")),
        source_size_bytes=int(source.get("size_bytes", 0)),
        source_sha256=str(source.get("sha256", "")),
        output_path=str(output.get("path", "")),
        remote_target=remote.get("target") if isinstance(remote, dict) else None,
        mode_requested=str(mode.get("requested", "encode")),
        mode_applied=mode.get("applied"),
        probe=data.get("probe") if isinstance(data.get("probe"), dict) else None,
        profile=data.get("profile") if isinstance(data.get("profile"), dict) else None,
        job_id=str(data.get("job_id", uuid.uuid4().hex)),
        status=str(data.get("status", "encoded")),
        created_at=str(data.get("created_at", utc_now_iso())),
        updated_at=str(data.get("updated_at", utc_now_iso())),
        output_size_bytes=output.get("size_bytes"),
        output_sha256=output.get("sha256"),
        remote_verified=bool(remote.get("verified")) if isinstance(remote, dict) else False,
        error=data.get("error"),
        history=list(data.get("history", [])),
    )
    return manifest


def _recover_interrupted_jobs(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Recover jobs left in 'running' state after a process crash or kill."""
    recovered: list[dict[str, Any]] = []
    stale_rows = conn.execute(
        "SELECT * FROM ingest_jobs WHERE status = 'running' ORDER BY id ASC;"
    ).fetchall()

    for row in stale_rows:
        job_id = row["job_id"]
        output_path = Path(row["output_path"])
        manifest_path = Path(row["manifest_path"])
        remote_target = row["remote_target"]
        attempts = int(row["attempts"])
        max_retries = int(row["max_retries"])
        now = utc_now_iso()

        manifest_data = _load_valid_encoded_manifest(manifest_path, output_path)
        if manifest_data is not None:
            m_status = manifest_data.get("status")
            remote_info = manifest_data.get("remote")
            remote_verified = (
                isinstance(remote_info, dict) and bool(remote_info.get("verified"))
            )
            if m_status == "ready" and remote_verified and remote_target is not None:
                conn.execute(
                    """
                    UPDATE ingest_jobs
                    SET status = 'ready', mode_applied = ?, last_error = NULL,
                        worker_pid = NULL, updated_at = ?, finished_at = ?
                    WHERE job_id = ?;
                    """,
                    (
                        (manifest_data.get("mode") or {}).get("applied"),
                        now,
                        now,
                        job_id,
                    ),
                )
                recovered.append({"job_id": job_id, "action": "marked_ready"})
                continue
            if m_status == "encoded" and remote_target is None:
                conn.execute(
                    """
                    UPDATE ingest_jobs
                    SET status = 'encoded', mode_applied = ?, last_error = NULL,
                        worker_pid = NULL, updated_at = ?, finished_at = ?
                    WHERE job_id = ?;
                    """,
                    (
                        (manifest_data.get("mode") or {}).get("applied"),
                        now,
                        now,
                        job_id,
                    ),
                )
                recovered.append({"job_id": job_id, "action": "marked_encoded"})
                continue

        # Interrupted before verified completion: clean partial output/manifest (never input!)
        if manifest_data is None:
            _safe_unlink_partial_artifact(output_path)
            _safe_unlink_partial_artifact(manifest_path)

        if attempts <= max_retries:
            conn.execute(
                """
                UPDATE ingest_jobs
                SET status = 'queued',
                    last_error = 'Recovered from interrupted run',
                    worker_pid = NULL,
                    updated_at = ?
                WHERE job_id = ?;
                """,
                (now, job_id),
            )
            recovered.append({"job_id": job_id, "action": "requeued"})
        else:
            conn.execute(
                """
                UPDATE ingest_jobs
                SET status = 'failed',
                    last_error = 'Interrupted and max_retries exceeded',
                    worker_pid = NULL,
                    updated_at = ?,
                    finished_at = ?
                WHERE job_id = ?;
                """,
                (now, now, job_id),
            )
            recovered.append({"job_id": job_id, "action": "failed_max_retries"})

    return recovered


def _claim_next_job(conn: sqlite3.Connection) -> sqlite3.Row | None:
    """Atomically claim the next queued job for this single worker."""
    now = utc_now_iso()
    conn.execute("BEGIN IMMEDIATE;")
    row = conn.execute(
        """
        SELECT * FROM ingest_jobs
        WHERE status = 'queued'
        ORDER BY attempts ASC, id ASC
        LIMIT 1;
        """
    ).fetchone()
    if row is None:
        conn.execute("COMMIT;")
        return None
    conn.execute(
        """
        UPDATE ingest_jobs
        SET status = 'running',
            attempts = attempts + 1,
            worker_pid = ?,
            started_at = ?,
            updated_at = ?
        WHERE id = ?;
        """,
        (os.getpid(), now, now, row["id"]),
    )
    conn.execute("COMMIT;")
    return conn.execute(
        "SELECT * FROM ingest_jobs WHERE id = ?;", (row["id"],)
    ).fetchone()


def _execute_claimed_job(
    row: sqlite3.Row,
    *,
    allowed_root: Path | None,
    ffmpeg_bin: str,
    ffprobe_bin: str,
    rclone_bin: str,
    ffmpeg_timeout: int,
    ffprobe_timeout: int,
    rclone_timeout: int,
    low_priority: bool,
) -> dict[str, Any]:
    """Execute or resume a claimed job using the core ingest pipeline."""
    input_path = Path(row["input_path"])
    output_path = Path(row["output_path"])
    manifest_path = Path(row["manifest_path"])
    remote_target = row["remote_target"]

    # Always re-validate input and confinement before running anything.
    validate_input_file(str(input_path), allowed_root=allowed_root)
    if allowed_root is not None:
        ensure_no_symlinks(output_path, "output")
        ensure_no_symlinks(manifest_path, "manifest")
        if not output_path.is_relative_to(allowed_root) or not manifest_path.is_relative_to(
            allowed_root
        ):
            raise ValidationError("Queued job output or manifest escapes allowed_root.")

    # Resume upload-only if local output was already encoded & hashed in manifest.
    existing_encoded = _load_valid_encoded_manifest(manifest_path, output_path)
    if existing_encoded is not None and remote_target is not None:
        _, normalized_remote = validate_remote_target(remote_target, output_path)
        manifest = _reconstruct_manifest(existing_encoded)
        try:
            upload_and_verify_output(
                output_path=output_path,
                remote_target=normalized_remote,
                rclone_bin=rclone_bin,
                rclone_timeout=rclone_timeout,
                manifest=manifest,
                manifest_path=manifest_path,
                low_priority=low_priority,
            )
            return manifest.to_dict()
        except Exception as exc:
            manifest.transition("error", error_message=sanitize_text(str(exc)))
            manifest.save_atomic(manifest_path)
            if isinstance(exc, IngestError):
                raise
            raise IngestError(sanitize_text(str(exc))) from exc

    cfg = validate_and_build_config(
        input_path=str(input_path),
        output_path=str(output_path),
        manifest_path=str(manifest_path),
        remote_target=remote_target,
        allowed_root=str(allowed_root) if allowed_root is not None else None,
        ffmpeg_bin=ffmpeg_bin,
        ffprobe_bin=ffprobe_bin,
        rclone_bin=rclone_bin,
        ffmpeg_timeout=ffmpeg_timeout,
        ffprobe_timeout=ffprobe_timeout,
        rclone_timeout=rclone_timeout,
        mode=row["mode"],
        low_priority=low_priority,
        dry_run=False,
    )
    return run_ingest(cfg)


def run_queue(
    *,
    db_path: str,
    allowed_root: str | None = None,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
    rclone_bin: str = "rclone",
    ffmpeg_timeout: int = 1800,
    ffprobe_timeout: int = 60,
    rclone_timeout: int = 1800,
    low_priority: bool = True,
    max_jobs: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run the single-worker locked batch loop over queued SQLite jobs."""
    root_abs = validate_allowed_root(allowed_root) if allowed_root else None
    db_abs = validate_db_path(db_path, allowed_root=root_abs, must_exist=True)
    validate_timeout(ffmpeg_timeout, "ffmpeg_timeout")
    validate_timeout(ffprobe_timeout, "ffprobe_timeout")
    validate_timeout(rclone_timeout, "rclone_timeout")
    if max_jobs is not None and (isinstance(max_jobs, bool) or max_jobs <= 0):
        raise ValidationError("max_jobs must be a positive integer.")

    if dry_run:
        conn = _connect_db(db_abs)
        try:
            pending = conn.execute(
                """
                SELECT * FROM ingest_jobs
                WHERE status IN ('queued', 'running')
                ORDER BY status DESC, attempts ASC, id ASC;
                """
            ).fetchall()
            jobs_plan = [_row_to_dict(r) for r in pending]
            if max_jobs is not None:
                jobs_plan = jobs_plan[:max_jobs]
            return {
                "dry_run": True,
                "db": str(db_abs),
                "low_priority": low_priority,
                "planned_jobs": jobs_plan,
            }
        finally:
            conn.close()

    with acquire_worker_lock(db_abs):
        conn = _connect_db(db_abs)
        try:
            recovered = _recover_interrupted_jobs(conn)
            processed = 0
            succeeded_encoded = 0
            succeeded_ready = 0
            requeued = 0
            failed = 0
            results: list[dict[str, Any]] = []

            while max_jobs is None or processed < max_jobs:
                row = _claim_next_job(conn)
                if row is None:
                    break
                processed += 1
                job_id = row["job_id"]
                attempts = int(row["attempts"])
                max_retries = int(row["max_retries"])

                try:
                    manifest_dict = _execute_claimed_job(
                        row,
                        allowed_root=root_abs,
                        ffmpeg_bin=ffmpeg_bin,
                        ffprobe_bin=ffprobe_bin,
                        rclone_bin=rclone_bin,
                        ffmpeg_timeout=ffmpeg_timeout,
                        ffprobe_timeout=ffprobe_timeout,
                        rclone_timeout=rclone_timeout,
                        low_priority=low_priority,
                    )
                    final_status = (
                        "ready" if manifest_dict.get("status") == "ready" else "encoded"
                    )
                    mode_applied = (manifest_dict.get("mode") or {}).get("applied")
                    now = utc_now_iso()
                    conn.execute(
                        """
                        UPDATE ingest_jobs
                        SET status = ?,
                            mode_applied = ?,
                            last_error = NULL,
                            worker_pid = NULL,
                            updated_at = ?,
                            finished_at = ?
                        WHERE job_id = ?;
                        """,
                        (final_status, mode_applied, now, now, job_id),
                    )
                    if final_status == "ready":
                        succeeded_ready += 1
                    else:
                        succeeded_encoded += 1
                    results.append(
                        {
                            "job_id": job_id,
                            "status": final_status,
                            "attempts": attempts,
                            "mode_applied": mode_applied,
                        }
                    )
                except ValidationError as exc:
                    now = utc_now_iso()
                    err = sanitize_text(str(exc))
                    conn.execute(
                        """
                        UPDATE ingest_jobs
                        SET status = 'failed',
                            last_error = ?,
                            worker_pid = NULL,
                            updated_at = ?,
                            finished_at = ?
                        WHERE job_id = ?;
                        """,
                        (err, now, now, job_id),
                    )
                    failed += 1
                    results.append(
                        {
                            "job_id": job_id,
                            "status": "failed",
                            "attempts": attempts,
                            "error": err,
                        }
                    )
                except IngestError as exc:
                    now = utc_now_iso()
                    err = sanitize_text(str(exc))
                    output_path = Path(row["output_path"])
                    manifest_path = Path(row["manifest_path"])
                    # Preserve output if encoding already completed and only upload failed.
                    if _load_valid_encoded_manifest(manifest_path, output_path) is None:
                        _safe_unlink_partial_artifact(output_path)
                        _safe_unlink_partial_artifact(manifest_path)

                    if attempts <= max_retries:
                        conn.execute(
                            """
                            UPDATE ingest_jobs
                            SET status = 'queued',
                                last_error = ?,
                                worker_pid = NULL,
                                updated_at = ?
                            WHERE job_id = ?;
                            """,
                            (err, now, job_id),
                        )
                        requeued += 1
                        results.append(
                            {
                                "job_id": job_id,
                                "status": "queued",
                                "attempts": attempts,
                                "error": err,
                            }
                        )
                    else:
                        conn.execute(
                            """
                            UPDATE ingest_jobs
                            SET status = 'failed',
                                last_error = ?,
                                worker_pid = NULL,
                                updated_at = ?,
                                finished_at = ?
                            WHERE job_id = ?;
                            """,
                            (err, now, now, job_id),
                        )
                        failed += 1
                        results.append(
                            {
                                "job_id": job_id,
                                "status": "failed",
                                "attempts": attempts,
                                "error": err,
                            }
                        )

            return {
                "db": str(db_abs),
                "recovered": recovered,
                "processed": processed,
                "succeeded_encoded": succeeded_encoded,
                "succeeded_ready": succeeded_ready,
                "requeued": requeued,
                "failed": failed,
                "results": results,
            }
        finally:
            conn.close()
