"""CLI entry point for Pixel single-file and SQLite batch media ingest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from ingest import IngestError, run_ingest, validate_and_build_config  # noqa: E402
from queue_store import (  # noqa: E402
    QUEUE_STATES,
    WorkerLockError,
    enqueue_job,
    enqueue_url_job,
    list_jobs,
    run_queue,
)
from validators import (  # noqa: E402
    DEFAULT_DOWNLOAD_TIMEOUT,
    DEFAULT_SOCKET_TIMEOUT,
    MAX_DOWNLOAD_BYTES,
    VALID_MODES,
    ValidationError,
    sanitize_text,
)

QUEUE_SUBCOMMANDS = ("queue-add", "queue-add-url", "queue-list", "queue-run")


def build_parser() -> argparse.ArgumentParser:
    """Create the single-file argument parser (backward-compatible default CLI)."""
    parser = argparse.ArgumentParser(
        prog="media-ingest",
        description=(
            "Pixel Media Ingest (stdlib): procesa archivo(s) locales autorizados "
            "hacia MP4 H.264 720p (CRF 26, preset veryfast, threads 2, filter_threads 1, "
            "AAC 96k, faststart, prioridad baja) o remux H264+AAC compatible, y opcionalmente "
            "sube y verifica con rclone copyto + rclone check hacia un remote privado. "
            "Subcomandos de cola SQLite: queue-add, queue-list, queue-run. "
            "No borra originales, no descarga URLs, no publica enlaces ni toca la BD de Pixel."
        ),
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Ruta local al archivo de vídeo autorizado (no URL, no symlinks).",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Ruta local de salida .mp4 (no debe existir ni ser symlink).",
    )
    parser.add_argument(
        "--manifest",
        required=True,
        help="Ruta al manifiesto JSON persistente .json (no debe existir ni ser symlink).",
    )
    parser.add_argument(
        "--remote",
        default=None,
        help=(
            "Destino opcional privado ya configurado en rclone, formato "
            "'remote:carpeta/archivo.mp4' (el nombre de archivo debe coincidir con --output)."
        ),
    )
    parser.add_argument(
        "--mode",
        choices=VALID_MODES,
        default="encode",
        help=(
            "Modo de procesamiento: encode (por defecto en CLI simple), auto (ffprobe local: "
            "remux si H264+AAC compatible o encode), remux (solo copia H264+AAC sin reducción "
            "prometida), mediacodec (experimental explícito, nunca automático)."
        ),
    )
    parser.add_argument(
        "--allowed-root",
        default=None,
        help="Directorio raíz autorizado opcional para confinar rutas locales.",
    )
    parser.add_argument(
        "--ffmpeg-bin",
        default="ffmpeg",
        help="Binario de ffmpeg a ejecutar sin shell (por defecto: ffmpeg).",
    )
    parser.add_argument(
        "--ffprobe-bin",
        default="ffprobe",
        help="Binario de ffprobe a ejecutar sin shell (por defecto: ffprobe).",
    )
    parser.add_argument(
        "--rclone-bin",
        default="rclone",
        help="Binario de rclone a ejecutar sin shell (por defecto: rclone).",
    )
    parser.add_argument(
        "--ffmpeg-timeout",
        type=int,
        default=1800,
        help="Tiempo máximo en segundos para ffmpeg (por defecto: 1800).",
    )
    parser.add_argument(
        "--ffprobe-timeout",
        type=int,
        default=60,
        help="Tiempo máximo en segundos para ffprobe (por defecto: 60).",
    )
    parser.add_argument(
        "--rclone-timeout",
        type=int,
        default=1800,
        help="Tiempo máximo en segundos para cada comando rclone (por defecto: 1800).",
    )
    parser.add_argument(
        "--no-low-priority",
        action="store_true",
        help="Desactiva os.nice(10) en subprocesos POSIX.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida entradas y muestra el plan/comandos sin ejecutar nada ni escribir archivos.",
    )
    return parser


def build_queue_parser() -> argparse.ArgumentParser:
    """Create argument parser for SQLite queue subcommands."""
    parser = argparse.ArgumentParser(
        prog="media-ingest",
        description="Cola SQLite persistente con bloqueo de worker único para Pixel Media Ingest.",
    )
    sub = parser.add_subparsers(dest="subcommand", required=True)

    p_add = sub.add_parser(
        "queue-add",
        help="Valida y encola un archivo local en la base SQLite.",
    )
    p_add.add_argument("--db", required=True, help="Ruta a la base SQLite (.db/.sqlite/.sqlite3).")
    p_add.add_argument("--input", required=True, help="Ruta local al archivo de vídeo autorizado.")
    p_add.add_argument("--output", required=True, help="Ruta local de salida .mp4.")
    p_add.add_argument("--manifest", required=True, help="Ruta al manifiesto JSON .json.")
    p_add.add_argument("--remote", default=None, help="Destino opcional rclone privado.")
    p_add.add_argument(
        "--mode",
        choices=VALID_MODES,
        default="auto",
        help="Modo de procesamiento en cola (por defecto: auto).",
    )
    p_add.add_argument(
        "--max-retries",
        type=int,
        default=2,
        help="Reintentos máximos tras fallo o interrupción (por defecto: 2).",
    )
    p_add.add_argument("--allowed-root", default=None, help="Raíz autorizada opcional.")

    p_add_url = sub.add_parser(
        "queue-add-url",
        help="Descarga un archivo por HTTPS directo con allowlist/SSRF y lo encola.",
    )
    p_add_url.add_argument("--db", required=True, help="Ruta a la base SQLite (.db/.sqlite/.sqlite3).")
    p_add_url.add_argument(
        "--url",
        required=True,
        help="URL HTTPS directa al archivo (sin credenciales, sin puertos especiales, sin redirects).",
    )
    p_add_url.add_argument(
        "--allow-host",
        action="append",
        required=True,
        dest="allow_hosts",
        help="Host permitido explícito (repetible).",
    )
    p_add_url.add_argument(
        "--input",
        required=True,
        help="Ruta local nueva donde guardar el archivo descargado (no debe existir ni ser symlink).",
    )
    p_add_url.add_argument("--output", required=True, help="Ruta local de salida .mp4.")
    p_add_url.add_argument("--manifest", required=True, help="Ruta al manifiesto JSON .json.")
    p_add_url.add_argument("--remote", default=None, help="Destino opcional rclone privado.")
    p_add_url.add_argument(
        "--mode",
        choices=VALID_MODES,
        default="auto",
        help="Modo de procesamiento en cola (por defecto: auto).",
    )
    p_add_url.add_argument(
        "--max-retries",
        type=int,
        default=2,
        help="Reintentos máximos tras fallo o interrupción (por defecto: 2).",
    )
    p_add_url.add_argument("--allowed-root", default=None, help="Raíz autorizada opcional.")
    p_add_url.add_argument(
        "--max-bytes",
        type=int,
        default=MAX_DOWNLOAD_BYTES,
        help=f"Límite de tamaño de descarga en bytes (máximo {MAX_DOWNLOAD_BYTES}, 2 GiB).",
    )
    p_add_url.add_argument(
        "--socket-timeout",
        type=int,
        default=DEFAULT_SOCKET_TIMEOUT,
        help=f"Timeout por socket en segundos (por defecto: {DEFAULT_SOCKET_TIMEOUT}).",
    )
    p_add_url.add_argument(
        "--download-timeout",
        type=int,
        default=DEFAULT_DOWNLOAD_TIMEOUT,
        help=f"Timeout total de descarga en segundos (por defecto: {DEFAULT_DOWNLOAD_TIMEOUT}).",
    )

    p_list = sub.add_parser(
        "queue-list",
        help="Lista trabajos y conteos por estado de la cola SQLite.",
    )
    p_list.add_argument("--db", required=True, help="Ruta a la base SQLite.")
    p_list.add_argument(
        "--status",
        choices=QUEUE_STATES,
        default=None,
        help="Filtrar por estado explícito.",
    )
    p_list.add_argument("--allowed-root", default=None, help="Raíz autorizada opcional.")

    p_run = sub.add_parser(
        "queue-run",
        help="Ejecuta el worker único con bloqueo y recuperación tras interrupción.",
    )
    p_run.add_argument("--db", required=True, help="Ruta a la base SQLite.")
    p_run.add_argument("--allowed-root", default=None, help="Raíz autorizada opcional.")
    p_run.add_argument("--ffmpeg-bin", default="ffmpeg", help="Binario de ffmpeg.")
    p_run.add_argument("--ffprobe-bin", default="ffprobe", help="Binario de ffprobe.")
    p_run.add_argument("--rclone-bin", default="rclone", help="Binario de rclone.")
    p_run.add_argument("--ffmpeg-timeout", type=int, default=1800, help="Timeout ffmpeg (s).")
    p_run.add_argument("--ffprobe-timeout", type=int, default=60, help="Timeout ffprobe (s).")
    p_run.add_argument("--rclone-timeout", type=int, default=1800, help="Timeout rclone (s).")
    p_run.add_argument(
        "--no-low-priority",
        action="store_true",
        help="Desactiva os.nice(10) en subprocesos POSIX.",
    )
    p_run.add_argument(
        "--max-jobs",
        type=int,
        default=None,
        help="Máximo de ejecuciones de trabajos en esta corrida.",
    )
    p_run.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra los trabajos pendientes sin bloquear ni ejecutar.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run CLI and return POSIX exit code."""
    effective_argv = list(sys.argv[1:] if argv is None else argv)

    try:
        if effective_argv and effective_argv[0] in QUEUE_SUBCOMMANDS:
            args = build_queue_parser().parse_args(effective_argv)
            if args.subcommand == "queue-add":
                result = enqueue_job(
                    db_path=args.db,
                    input_path=args.input,
                    output_path=args.output,
                    manifest_path=args.manifest,
                    remote_target=args.remote,
                    mode=args.mode,
                    max_retries=args.max_retries,
                    allowed_root=args.allowed_root,
                )
            elif args.subcommand == "queue-add-url":
                result = enqueue_url_job(
                    db_path=args.db,
                    url=args.url,
                    allow_hosts=args.allow_hosts,
                    input_path=args.input,
                    output_path=args.output,
                    manifest_path=args.manifest,
                    remote_target=args.remote,
                    mode=args.mode,
                    max_retries=args.max_retries,
                    allowed_root=args.allowed_root,
                    max_bytes=args.max_bytes,
                    socket_timeout=args.socket_timeout,
                    download_timeout=args.download_timeout,
                )
            elif args.subcommand == "queue-list":
                result = list_jobs(
                    db_path=args.db,
                    status=args.status,
                    allowed_root=args.allowed_root,
                )
            else:
                result = run_queue(
                    db_path=args.db,
                    allowed_root=args.allowed_root,
                    ffmpeg_bin=args.ffmpeg_bin,
                    ffprobe_bin=args.ffprobe_bin,
                    rclone_bin=args.rclone_bin,
                    ffmpeg_timeout=args.ffmpeg_timeout,
                    ffprobe_timeout=args.ffprobe_timeout,
                    rclone_timeout=args.rclone_timeout,
                    low_priority=not args.no_low_priority,
                    max_jobs=args.max_jobs,
                    dry_run=args.dry_run,
                )
        else:
            args = build_parser().parse_args(effective_argv)
            cfg = validate_and_build_config(
                input_path=args.input,
                output_path=args.output,
                manifest_path=args.manifest,
                remote_target=args.remote,
                allowed_root=args.allowed_root,
                ffmpeg_bin=args.ffmpeg_bin,
                ffprobe_bin=args.ffprobe_bin,
                rclone_bin=args.rclone_bin,
                ffmpeg_timeout=args.ffmpeg_timeout,
                ffprobe_timeout=args.ffprobe_timeout,
                rclone_timeout=args.rclone_timeout,
                mode=args.mode,
                low_priority=not args.no_low_priority,
                dry_run=args.dry_run,
            )
            result = run_ingest(cfg)
    except ValidationError as exc:
        print(f"Validation error: {sanitize_text(str(exc))}", file=sys.stderr)
        return 2
    except WorkerLockError as exc:
        print(f"Worker lock error: {sanitize_text(str(exc))}", file=sys.stderr)
        return 3
    except IngestError as exc:
        print(f"Ingest error: {sanitize_text(str(exc))}", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
