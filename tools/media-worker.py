#!/usr/bin/env python3
"""Supervise the private ingest queue; no HTTP listener or credentials in arguments."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--interval', type=int, default=30)
    args = parser.parse_args()
    root = Path(args.root).resolve(strict=True)
    if args.interval < 10:
        parser.error('interval must be at least 10 seconds')
    stop = threading.Event()
    child = None

    def shutdown(signum, frame):
        stop.set()
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    cli = Path(__file__).resolve().parent / 'media-ingest'
    print('Private media worker started; PAUSE file suspends new jobs.', flush=True)
    while not stop.is_set():
        if ((root / 'queue.db').is_file() and not (root / 'PAUSE').exists()
                and shutil.disk_usage(root).free >= 2 * 1024**3):
            child = subprocess.Popen([
                sys.executable, str(cli), 'queue-run', '--db', str(root / 'queue.db'),
                '--allowed-root', str(root), '--max-jobs', '1', '--ffmpeg-timeout', '7200',
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                stdout, stderr = child.communicate(timeout=11100)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                stdout, stderr = child.communicate()
            if not stop.is_set():
                try:
                    result = json.loads(stdout)
                    if result.get('processed') or result.get('recovered'):
                        # Log counts, never source URLs, credentials or subprocess stderr.
                        print(json.dumps({k: result.get(k) for k in (
                            'processed', 'succeeded_ready', 'succeeded_encoded', 'failed', 'requeued')}), flush=True)
                except (ValueError, TypeError):
                    print(f'Worker returned {child.returncode}; inspect the private queue status.', flush=True)
            child = None
        stop.wait(args.interval)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
