# Ingesta de medios hacia Drive (CLI + Cola SQLite Termux 4 GB)

Fecha: 13 de noviembre de 2026 (America/Lima).

## Confirmado

- Se mantiene el CLI portable en `tools/media-ingest/` usando únicamente `stdlib` de Python y manteniendo compatibilidad con la invocación simple previa.
- **Perfiles y `--mode auto/remux/encode` (y `mediacodec` experimental explícito)**:
  - `encode` (perfil Termux 4 GB): `libx264` 720p sin upscaling (`CRF 26`, `preset veryfast`, `-threads 2`, `-filter_threads 1`, `AAC 96k`, `+faststart`, prioridad baja POSIX con `os.nice(10)`).
  - `auto`: inspecciona localmente con `ffprobe` (`-protocol_whitelist file,pipe`); aplica `remux` (`-c copy +faststart`) solo si el archivo ya es `h264` (`yuv420p`) + `aac` (sin prometer reducción de tamaño/resolución), o `encode` en caso contrario.
  - `remux`: fuerza remux tras validar compatibilidad con `ffprobe` y falla si no es compatible.
  - `mediacodec`: solo experimental explícito; verifica `h264_mediacodec` en `ffmpeg -encoders` antes de ejecutarse y nunca se activa automáticamente en `auto`.
- **Cola SQLite persistente (`queue-add`, `queue-add-url`, `queue-list`, `queue-run`)**:
  - `queue-add` valida y encola archivos locales sin borrar originales ni descargar URLs.
  - `queue-add-url` descarga únicamente enlaces `https://` directos a archivos con `--allow-host` explícito repetible, sin credenciales, sin puertos especiales distintos de `443`, sin redirects `3xx`, sin shell y sin registrar query strings/secretos. Resuelve DNS una vez exigiendo que **todas** las IP sean públicas (bloquea `private`, `loopback`, `link-local`, `multicast`, `reserved`, `unspecified` e IPv4-mapped IPv6) y fija la IP conectada manteniendo el hostname TLS para impedir DNS rebinding/SSRF. Descarga en streaming (hasta `2 GiB` configurable), con timeout por socket y total, comprobación de espacio, archivo parcial confinado con UUID y permisos `0600` (borra solo su propio parcial al fallar). Reutiliza `queue-add` tras completar la descarga y conserva el archivo completo para revisión si falla el encolado.
  - Worker único protegido por bloqueo exclusivo `fcntl.flock` (`<db>.lock`, código de salida `3` si hay otro worker activo).
  - Estados explícitos (`queued`, `running`, `encoded`, `ready`, `failed`) con reintentos configurables (`--max-retries`) y recuperación segura tras interrupción: reanuda subida si el MP4 ya tiene `sha256` válido en manifiesto, o limpia solo salidas parciales (nunca el original) y reencola/falla según reintentos.
- **Destino rclone privado opcional**: sin `--remote`, los trabajos terminan en `encoded`; solo pasan a `ready` tras `rclone copyto --immutable` y `rclone check --one-way` exitosos.
- **Hardware MediaCodec en tablet real (muestra sintética)**: comprobado realmente `h264_mediacodec` en tablet con muestra sintética `lavfi` 720p 24fps de `3s` en `1.09s` (código de retorno `0`). No extrapolar este resultado a un capítulo largo real (decodificación real, audio, temperatura, duración).
- **Pruebas unitarias**: 33 pruebas `unittest` en `tools/media-ingest/tests/` (sin red real; DNS, sockets/HTTP, `ffprobe`/`ffmpeg`/`rclone` simulados) cubriendo modos `auto`/`remux`/`encode`/`mediacodec`, cola SQLite, concurrencia (`flock`), recuperación tras interrupción, reintentos, y `queue-add-url` (SSRF/DNS pinning, redirects, límites de tamaño/espacio/timeout, permisos `0600` y preservación tras fallo de encolado).

## Pendiente / Límites explícitos

- **OAuth de Google Drive**: no hay credenciales ni flujo OAuth integrado; el remote privado de `rclone` debe configurarse manualmente fuera del repo.
- **Descarga de URLs fuera de enlaces directos**: no se soportan páginas HTML/iframe, DRM, `.m3u8` ni enlaces MEGA; el CLI simple y `queue-add` siguen rechazando URLs.
- **MediaCodec en capítulos largos**: sigue pendiente validar comportamiento térmico, memoria y tiempo en un capítulo real completo.
- **Servicios / daemons**: no se inician ni configuran servicios en segundo plano.
- **Servidor, BD de Pixel y cuotas**: no se modificaron archivos fuera de `tools/media-ingest/` y `docs/brain/drive-ingest.md`; Drive privado no garantiza streaming ilimitado ni exención de cuotas/límites de Cloudflare Tunnel/CDN.
