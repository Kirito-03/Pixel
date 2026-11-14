# Pixel Media Ingest (CLI + Cola SQLite para Termux 4 GB)

Herramienta CLI portable escrita únicamente con la **biblioteca estándar de Python** (`stdlib`) para procesar archivos locales autorizados hacia MP4 mediante `ffmpeg` / `ffprobe` sin shell, con soporte de **cola persistente SQLite** (`queue-add`, `queue-add-url`, `queue-list`, `queue-run`) para procesamiento por lotes en dispositivos de recursos acotados (por ejemplo, tablet Termux de 4 GB RAM) y subida opcional verificada con `rclone copyto` + `rclone check` hacia un remote privado ya configurado.

## Estado y límites explícitos

- **OAuth de Google Drive pendiente**: no hay flujo OAuth integrado ni credenciales en el repo. Si se usa `--remote`, asume un remote privado de `rclone` previamente configurado por el usuario fuera del repositorio. Sin `--remote`, el estado final es `encoded` (nunca `ready` en Drive).
- **Descarga de URLs acotada (`queue-add-url`)**:
  - El CLI simple y `queue-add` siguen rechazando URLs.
  - `queue-add-url` acepta **únicamente enlaces `https://` directos a archivos** con `--allow-host` explícito y repetible (sin credenciales embebidas, sin puertos especiales distintos de `443`, sin redirects `3xx`, sin shell).
  - Resuelve DNS una sola vez, exige que **todas** las IP resueltas sean públicas (bloquea `private`, `loopback`, `link-local`, `multicast`, `reserved`, `unspecified` e IPv4-mapped IPv6 como `::ffff:127.0.0.1`) y fija la IP conectada manteniendo el hostname TLS (`SNI`/certificado) para impedir DNS rebinding y SSRF.
  - Descarga en streaming (límite configurable, máximo `2 GiB`), con timeouts por socket y total, comprobación de espacio en disco, archivo parcial confinado con UUID y permisos `0600` (al fallar borra únicamente su propio parcial).
  - Al completar la descarga, reutiliza `queue-add`; si el encolado falla, conserva el archivo completo descargado para revisión manual.
  - **No soporta** páginas HTML/iframe, DRM, playlists `.m3u8` ni enlaces MEGA.
  - No registra URLs con query strings ni secretos en logs o salidas JSON.
- **No borra originales**: los archivos de entrada nunca se eliminan ni se sobrescriben.
- **No inicia servicios ni modifica la BD de Pixel**: `queue-run` ejecuta un worker secuencial bajo demanda y bloqueado con `fcntl.flock`; no instala daemons ni toca servidor/frontend/BD principal.
- **Remux sin reducción prometida**: en `--mode auto` o `--mode remux`, si `ffprobe` confirma vídeo `h264` (`yuv420p`) y audio `aac` (o sin audio), se copia a MP4 (`-c copy +faststart`) sin re-codificar ni prometer reducción de tamaño o resolución.
- **MediaCodec solo experimental explícito**: `--mode mediacodec` verifica explícitamente `h264_mediacodec` en `ffmpeg -encoders` antes de ejecutarse; **nunca** se selecciona de forma automática en `--mode auto`. En tablet real solo se comprobó una muestra sintética `lavfi` 720p 24fps de `3s` (`1.09s`, código `0`); no extrapolar a capítulos largos.
- **No prometer streaming ilimitado**: almacenamiento amplio en Drive no equivale a ancho de banda ni cuotas de API/túnel ilimitadas.

## Requisitos

- Python 3.10+ (solo `stdlib`).
- `ffmpeg` y `ffprobe` disponibles en `PATH` (o indicados con `--ffmpeg-bin` / `--ffprobe-bin`).
- `rclone` disponible en `PATH` únicamente si se utiliza `--remote` con un remote privado ya configurado.

## Modos (`--mode`)

- `encode` (por defecto en CLI simple): `libx264`, escala máxima `1280x720` sin upscaling y dimensiones pares, `-crf 26`, `-preset veryfast`, `-threads 2`, `-filter_threads 1`, `-pix_fmt yuv420p`, `aac 96k`, `-movflags +faststart`, prioridad baja POSIX (`os.nice(10)`, desactivable con `--no-low-priority`).
- `auto` (por defecto en `queue-add`): ejecuta `ffprobe` local (`-protocol_whitelist file,pipe`); usa `remux` si el flujo es `h264` (`yuv420p`) + `aac`, o `encode` en caso contrario.
- `remux`: fuerza copia directa (`-map 0:v:0 -map 0:a? -c copy +faststart`) tras verificar compatibilidad con `ffprobe`; falla si el archivo no es compatible.
- `mediacodec`: experimental explícito (`h264_mediacodec` 720p); falla si `ffmpeg -encoders` no expone `h264_mediacodec`.

## Uso CLI simple (compatible)

```bash
python3 tools/media-ingest --help
```

Simulación sin efectos (`--dry-run`):

```bash
python3 tools/media-ingest \
  --input /ruta/autorizada/capitulo01.mkv \
  --output /ruta/salida/capitulo01.mp4 \
  --manifest /ruta/salida/capitulo01.manifest.json \
  --mode auto \
  --remote gdrive_privado:pixel/anime/capitulo01.mp4 \
  --allowed-root /ruta \
  --dry-run
```

Solo local (`encoded`):

```bash
python3 tools/media-ingest \
  --input /ruta/autorizada/capitulo01.mkv \
  --output /ruta/salida/capitulo01.mp4 \
  --manifest /ruta/salida/capitulo01.manifest.json \
  --mode encode
```

## Cola SQLite por lotes (`queue-add`, `queue-list`, `queue-run`)

1. Encolar trabajos locales autorizados:

```bash
python3 tools/media-ingest queue-add \
  --db /ruta/cola/ingest.db \
  --input /ruta/autorizada/capitulo01.mkv \
  --output /ruta/salida/capitulo01.mp4 \
  --manifest /ruta/salida/capitulo01.manifest.json \
  --remote gdrive_privado:pixel/anime/capitulo01.mp4 \
  --mode auto \
  --max-retries 2 \
  --allowed-root /ruta
```

2. Consultar estados y conteos (`queued`, `running`, `encoded`, `ready`, `failed`):

```bash
python3 tools/media-ingest queue-list --db /ruta/cola/ingest.db
python3 tools/media-ingest queue-list --db /ruta/cola/ingest.db --status queued
```

3. Ejecutar worker único con bloqueo exclusivo (`<db>.lock`) y recuperación tras interrupción:

```bash
python3 tools/media-ingest queue-run \
  --db /ruta/cola/ingest.db \
  --allowed-root /ruta \
  --ffmpeg-timeout 1800 \
  --rclone-timeout 1800
```

Comportamiento ante interrupción y reintentos:
- Si otro `queue-run` mantiene el bloqueo `flock`, falla inmediatamente con código de salida `3`.
- Al iniciar `queue-run`, cualquier trabajo que quedó en `running` tras un corte se recupera de forma segura:
  - Si el manifiesto y el `sha256` del MP4 de salida ya coinciden como `encoded`/`uploading`/`verifying`, reanuda la subida sin re-codificar (o marca `encoded` si no hay `--remote`).
  - Si el encode quedó incompleto, limpia únicamente el artefacto parcial de salida/manifiesto (nunca el archivo original) y reencola si `attempts <= max_retries`, o marca `failed` si agotó reintentos.

## Pruebas unitarias (sin red, con binarios simulados)

```bash
python3 -m unittest discover -s tools/media-ingest/tests -v
```
