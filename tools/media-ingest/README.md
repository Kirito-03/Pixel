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
- **Solo AV1**: un vídeo AV1 existente se copia a MP4 con `-c copy +faststart`; conserva vídeo y audio sin recodificar. Los demás códecs se convierten una sola vez a AV1, sin reducir resolución, profundidad de píxel o fps. La conversión no es matemáticamente sin pérdida.
- **Reanudación verificada**: se conserva el original. Las salidas preparadas solo se reutilizan cuando coinciden su SHA256 y un manifiesto AV1; los manifiestos H.264 antiguos no se aceptan para nuevas subidas automáticas. No se modifican archivos ya publicados.
- **MediaCodec H.264 deshabilitado**: los modos válidos son `auto`, `remux` y `encode`; nunca hay fallback automático a H.264.
- **No prometer streaming ilimitado**: almacenamiento amplio en Drive no equivale a ancho de banda ni cuotas de API/túnel ilimitadas.

## Requisitos

- Python 3.10+ (solo `stdlib`).
- `ffmpeg` y `ffprobe` disponibles en `PATH` (o indicados con `--ffmpeg-bin` / `--ffprobe-bin`).
- `rclone` disponible en `PATH` únicamente si se utiliza `--remote` con un remote privado ya configurado.

## Modos (`--mode`)

- `encode` (por defecto en CLI simple) y `auto`: inspeccionan con `ffprobe`; si ya es AV1, copian vídeo y audio. Para otros códecs usan `libsvtav1`, CRF25, preset8, `lp=2`, threads2, prioridad baja. Si SVT no está disponible, se admite `libaom-av1` CRF25/cpu-used6; si no hay codificador AV1, falla conservando el original. No se aplican filtros de escala ni cambio de fps. El audio se copia; si no cabe en MP4, se produce un error explícito sin degradarlo.
- `remux`: fuerza copia AV1 (`-c copy +faststart`) después de verificar el códec; rechaza vídeos de otro códec.
- Antes de marcar `encoded` se comprueban AV1, dimensiones, píxeles, fps, duración y audio contra el original. La calidad visual y la velocidad real de una conversión requieren una muestra del material; no se promete pérdida cero ni tiempo fijo. La principal aceleración consiste en conservar AV1 existente y reanudar subidas preparadas.

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
  - Si el manifiesto AV1 y el `sha256` del MP4 de salida ya coinciden como `encoded`/`uploading`/`verifying`, reanuda la subida sin re-codificar (o marca `encoded` si no hay `--remote`).
  - Si el encode quedó incompleto, limpia únicamente el artefacto parcial de salida/manifiesto (nunca el archivo original) y reencola si `attempts <= max_retries`, o marca `failed` si agotó reintentos.

## Pruebas unitarias (sin red, con binarios simulados)

```bash
python3 -m unittest discover -s tools/media-ingest/tests -v
```
