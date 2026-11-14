#!/usr/bin/env python3
"""Private MP4Upload connector. URLs arrive through stdin and are not logged."""
import json
import os
import re
import shutil
import sqlite3
import fcntl
import tempfile
from pathlib import Path
import sys
import uuid
from functools import partial
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parent / 'media-ingest'))
from queue_store import enqueue_url_job
from url_download import download_https_file
from yt_dlp import YoutubeDL
from validators import ValidationError, sanitize_text

class Quiet:
    def debug(self, *args): pass
    def info(self, *args): pass
    def warning(self, *args): pass
    def error(self, *args): pass


def save_mapping(folder, mapping):
    previous = folder / 'catalogue.json'
    if previous.is_file():
        saved = json.loads(previous.read_text())
        mapping = {**saved, **mapping}
    fd, temporary = tempfile.mkstemp(prefix='.catalogue-', suffix='.json', dir=folder)
    try:
        with os.fdopen(fd, 'w') as handle:
            json.dump(mapping, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, folder / 'catalogue.json')
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    data = json.loads(sys.stdin.read(16384))
    episode_number = str(data['number'])
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?', episode_number):
        raise ValueError('Invalid episode number')
    episode_folder = Path.home() / 'server/data/pixel-ingest' / f"episode-{int(data['episode_id'])}"
    lock = None
    if data.get('enqueue'):
        episode_folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        lock = (episode_folder / '.producer.lock').open('a')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        db = episode_folder.parent / 'queue.db'
        if db.exists():
            with sqlite3.connect(db) as connection:
                connection.row_factory = sqlite3.Row
                existing = connection.execute('SELECT job_id,remote_target,status FROM ingest_jobs WHERE output_path = ?', (str(episode_folder / 'episode.mp4'),)).fetchone()
            if existing:
                mapping = {'episode_id':data['episode_id'], 'anime_id':data['anime_id'], 'number':episode_number, 'job_id':existing['job_id'], 'remote_target':existing['remote_target'], 'published':False}
                save_mapping(episode_folder, mapping)
                print(json.dumps({'episode_id':data['episode_id'],'already_queued':True,'status':existing['status']}))
                return
        if shutil.disk_usage(episode_folder).free < 3 * 1024**3:
            raise ValueError('At least 3 GiB free disk required before downloading')
    source = urlsplit(data['url'])
    if (source.scheme != 'https' or source.hostname not in ('www.mp4upload.com', 'mp4upload.com')
            or source.username or source.password or source.port not in (443, None)):
        raise ValueError('Unsupported source')
    with YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True,
                    'socket_timeout': 15, 'retries': 0, 'logger': Quiet(),
                    'noplaylist': True, 'cachedir': False}) as resolver:
        info = resolver.extract_info(data['url'], download=False)
    formats = [f for f in info.get('formats', []) if f.get('protocol') == 'https' and f.get('ext') == 'mp4' and not f.get('has_drm')]
    if not formats:
        raise ValueError('No direct HTTPS MP4 found; HLS is not supported here')
    selected = formats[-1]
    direct = urlsplit(selected['url'])
    if direct.scheme != 'https' or not direct.hostname or not (direct.hostname == 'mp4upload.com' or direct.hostname.endswith('.mp4upload.com')):
        raise ValueError('Unsupported resolved source')
    # One provider-specific exception; the generic CLI still accepts HTTPS443 only.
    allowed_ports = (443,)
    if direct.port == 183 and direct.hostname.endswith('.mp4upload.com'):
        allowed_ports = (443, 183)
    if not data.get('enqueue'):
        print(json.dumps({'episode_id': data['episode_id'], 'resolved': True,
                          'protocol': 'https', 'extension': 'mp4', 'source_host': direct.hostname, 'source_port': direct.port or 443, 'downloaded': False}))
        return
    root = Path.home() / 'server/data/pixel-ingest'
    folder = root / f"episode-{int(data['episode_id'])}"
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    output = folder / 'episode.mp4'
    provider_headers = {'Referer': data['url']}
    agent = (selected.get('http_headers') or info.get('http_headers') or {}).get('User-Agent')
    if agent:
        provider_headers['User-Agent'] = agent
    result = enqueue_url_job(
        db_path=str(root / 'queue.db'), url=selected['url'], allow_hosts=[direct.hostname],
        input_path=str(folder / f"source-{uuid.uuid4().hex}.mp4"), output_path=str(output), manifest_path=str(folder / 'manifest.json'),
        remote_target=f"pixel-drive:PixelNoSekai/Anime/{int(data['anime_id'])}/{int(data['episode_id'])}/episode.mp4",
        download_fn=partial(download_https_file, request_headers=provider_headers),
        mode='mediacodec', allowed_ports=allowed_ports, allowed_root=str(root), max_bytes=512 * 1024**2,
    )
    mapping = {'episode_id': data['episode_id'], 'anime_id': data['anime_id'],
               'number': data['number'], 'job_id': result['job_id'],
               'remote_target': result['remote_target'], 'published': False}
    save_mapping(folder, mapping)
    print(json.dumps(mapping))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error_type': type(exc).__name__, 'reason': re.sub(r'https?://[^\s]+', '[source]', sanitize_text(str(exc)))[:300]}))
        raise SystemExit(1)
