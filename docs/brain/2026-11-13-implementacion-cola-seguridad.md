# Pixel: cola privada, Drive y seguridad — 13 noviembre 2026

## Recuperación confirmada

El usuario autorizó una base nueva porque perdió acceso al VPS anterior. PostgreSQL dedicado en la tablet: `~/server/data/pixel-postgres`, base `bd_pixel`, migraciones 001–005. Backend `pixel-backend` en PM2, localhost:3001, nginx:8081. Arranque `~/server/start-pixel.sh` llamado desde `start-all.sh`. El catálogo REST local responde 200. La web pública cargó la selección de perfiles por HTTPS en navegador.

El bot ha reconstruido 496 episodios al consultar esta sesión. La muestra de episodios 493–496 contiene páginas embebidas de Voe/MP4Upload/Byse/UPNShare en `video_url`, `stream_url` y `external_servers`. Esas URLs no son archivos MP4 directos. No se han descargado ni subido estos capítulos a Drive. Hace falta resolver fuentes admitidas y luego registrar el archivo publicado; no confundir metadatos de episodios con medios ya almacenados.

## Implementación con agy-cli

agy-cli implementó los modos `auto`, `remux`, `encode`, `mediacodec` y cola SQLite con bloqueo exclusivo, estados persistentes y recuperación tras interrupción. Codex revisó y desplegó el motor, autorizó Drive con el usuario y añadió supervisor `tools/media-worker.py` sin escucha HTTP, un trabajo por ciclo, baja prioridad, pausa por archivo `PAUSE` y umbral de 2 GiB libres antes de nuevos trabajos. La lectura de temperatura de batería no resultó disponible; no existe garantía de pausa térmica propia. Android mantiene sus controles térmicos.

Datos privados fuera del directorio web: `~/server/data/pixel-ingest/queue.db`. PM2 `pixel-media-worker`; arranque agregado a `start-pixel.sh`. Para pausar nuevos trabajos: crear `~/server/data/pixel-ingest/PAUSE`; quitarlo para reanudar. Para detener también el trabajo actual: `pm2 stop pixel-media-worker`. Nunca elimina originales automáticamente; hay que vigilar el espacio de la tablet.

Drive: remote `pixel-drive:`, scope OAuth `drive.file`, archivos privados. El usuario completó el consentimiento. Prueba real sintética de tres segundos, transcodificación MediaCodec + subida + `rclone check`: estado `ready`, `PixelNoSekai/Pruebas/smoke-hardware.mp4`, 736774 bytes. Prueba de encoder aislada a 720p: 3 segundos en 1,09 segundos de reloj; no es una medición sostenida con capítulos reales. No promete conservación exacta de calidad ni reducción para todos los archivos.

Advertencia operativa de rclone: el cliente OAuth compartido está siendo retirado durante 2026. La autorización funcionó hoy; se debe configurar un client_id propio de Google para continuidad. Nunca guardar tokens, códigos ni contraseñas en Git, notas o logs. Drive no es un CDN público ilimitado; la reproducción pública desde archivo privado requiere diseño y prueba propios.

## Seguridad corregida y desplegada

- Perfiles REST, listas, progreso, continuar viendo y descargas: JWT y comprobación de propietario; `/users/:id` solo identidad propia.
- Creación de contenido y metadatos de imágenes: admin.
- Avatares: autenticación antes de escribir, MIME exacto, firmas de JPEG/PNG/GIF/WebP, límite 5 MB, URL de origen fijo. No refleja `X-Client-BaseURL` ni imprime headers con credenciales.
- Login REST rechaza texto plano y marcadores OAuth como `google_auth`, compara bcrypt y devuelve JWT para los clientes REST. Los clientes antiguos deben enviar el bearer devuelto; la app actual usa Firebase/Firestore para sus perfiles.
- SESSION_SECRET fuerte obligatorio en producción; cookie HttpOnly/Secure y SameSite=Lax.
- Correcciones previas conservadas: proxy HTTPS de hosts exactos sin redirects, conversión HLS restringida a admin, forgot-password suspendido y reset con bcrypt.
- 11 pruebas locales de regresión, incluidas peticiones HTTP reales de avatar, pasaron.
- Tras despliegue: catálogo local200; rutas privadas sin credenciales401. Las peticiones automatizadas desde laptop al dominio recibieron403 de borde; eso no valida por sí mismo el origen público. El navegador sí cargó la web HTTPS.
- Backup principal `~/server/backups/pixel-before-security-v2.tgz`; cambios locales preexistentes respetados, app remota desplegada conservando sus diferencias previas.

## Pendientes de seguridad y producto

No equivale a una auditoría integral ni certificación. Falta comprobar reglas reales de Firebase/Firestore/Storage (no hay reglas versionadas en este repo), tienda de sesiones persistente, flujo completo de recuperación con tokens de un solo uso, validación SSRF profunda del pipeline antiguo de admin/HLS, OAuth Google del sitio y exposición de otros servicios Termux (Redis/WebDAV/MariaDB). No se han cambiado esos servicios ajenos al alcance de Pixel en esta sesión.

Obsidian: el MCP pixel-brain no pudo guardar esta actualización porque el volumen Reze con la bóveda no está montado. Este documento en el proyecto es la copia durable para sincronizar cuando vuelva el disco.

## Actualización: dependencias y conector del catálogo

`npm audit --omit=dev` detectó inicialmente 18 avisos (1 crítico, 10 altos y 7 moderados). Se aplicó `npm audit fix --omit=dev --ignore-scripts`, sin `--force`, y se desplegó el lock actualizado mediante npm ci en la tablet. Resultado posterior: **0 críticos, 0 altos, 3 moderados** en `node-pg-migrate`/`glob`/`minimatch`. La corrección propuesta por npm para esos tres cambia la versión principal de migraciones: se dejó pendiente para validar una migración aparte. Backend comprobado después: catálogo200 y rutas privadas401. La máquina local tiene Node20.18.0 y recibió advertencias de engines para cheerio/undici; el servidor real usa Node24.22.3.

Codex añadió `tools/catalogue-ingest.mjs` + `tools/resolve-and-enqueue.py`: conector privado MP4Upload usando yt-dlp2026.10.26 en un venv externo, sin ejecutar JS de páginas ni enviar cookies/autorización del usuario. Resuelve fuentes a HTTPS MP4 y las entrega al descargador con DNS público fijado, sin redirecciones, máximo512MiB por capítulo en este conector. Excepción de puerto limitada al183 cuando el host es subdominio de mp4upload.com; el CLI genérico mantiene443. Solo permite cabeceras Referer/User-Agent del proveedor; no Authorization ni Cookie. Las URLs firmadas nunca se imprimen. 35 pruebas del motor pasan después de estos ajustes; 11 de seguridad también.

Un capítulo real del catálogo (ID496, anime59, episodio11) resolvió correctamente a HTTPSMP4 en a3.mp4upload.com:183. Primeras transferencias: rechazo por443 únicamente, luego403 del proveedor. Se añadió el Referer de la página original y el User-Agent del resolver; resultado de prueba final se registra por separado. No afirmar que el catálogo entero está archivado.

Uso privado desde SSH, en `~/server/cloud/proyectos/Pixel`:

```bash
# Resolver un episodio sin descargar (modo predeterminado)
node --env-file=.env tools/catalogue-ingest.mjs --episode-id 496
# Descargar y encolar, con almacenamiento privado en Drive
node --env-file=.env tools/catalogue-ingest.mjs --episode-id 496 --enqueue
# Lote secuencial, sin descargar por defecto; límite1..20
node --env-file=.env tools/catalogue-batch.mjs --limit 3
# Lote de descarga/encolado; no correr masivamente hasta validar la fuente
node --env-file=.env tools/catalogue-batch.mjs --limit 3 --enqueue
# Estado de los trabajos
python3 tools/media-ingest queue-list --db "$HOME/server/data/pixel-ingest/queue.db"
```

Cada archivo archivado lleva `catalogue.json` privado con episode_id/job_id y `published:false`. No reemplazar `video_url`/`stream_url` por enlaces privados de Drive: no serían reproducibles por el visitante. La entrega pública queda pendiente. La descarga HTTPS inicial se realiza antes de encolar: si hay un corte durante la descarga puede requerir volver a resolver y descargar; la recuperación persistente cubre el procesamiento y la subida de trabajos ya encolados, no una reanudación HTTP por rangos.

## Validación real adicional y revisión con agy-cli

El Referer/User-Agent solucionó el403 de MP4Upload. La primera descarga completa reveló que Python de Termux omite `os.link`; se corrigió la promoción del archivo mediante copia de memoria acotada con creación exclusiva (`O_EXCL`), sin sobrescribir archivos existentes. Se añadió regresión que simula ausencia de os.link. **36 pruebas de ingestión pasan**. La segunda descarga del capítulo real496 terminó correctamente y se encoló como job `30500107c17e48e3b519e9f78cc04d8f`, destino privado `pixel-drive:PixelNoSekai/Anime/59/11/episode.mp4`; estado final de subida se registra después.

agy-cli revisó después las herramientas de operación y detectó riesgos concretos. Se corrigieron: comprobación previa en queue.db y bloqueo de productor por episodio para impedir redescargas duplicadas; metadata catalogue.json con reemplazo atómico; margen mínimo de3GiB antes de descargar; supervisor con plazo11100s que cubre probe+encode+subida+check; CDN resultante restringida a mp4upload.com y sus subdominios; destino nuevo por ID de episodio y validación explícita de numeración, sin truncar capítulos decimales. La fase de resolución de yt-dlp sigue siendo una herramienta privada del operador (no un endpoint público) y realiza sus propias solicitudes al proveedor; no se afirma que tenga el mismo pinning del descargador final. Revisar aislamiento de esa fase antes de exponerla en un panel público.

## Política de calidad y recursos observada en el piloto

El capítulo496 fuente es AV1, yuv420p10le, 1920x1080 con AAC, tamaño125635937 bytes. Ya está muy comprimido: no afirmar que H.264 sea más pequeño. Se conserva la fuente local y se sube una copia original sin recodificación a `PixelNoSekai/Anime/59/11/source-av1-1080p.mp4`. La variante720p H.264 es para compatibilidad y puede pesar más o perder detalle. El piloto se cambió explícitamente a MediaCodec tras detener y recuperar el trabajo; no hubo que descargar de nuevo para cambiar de encoder. El decoder también se limita a dos hilos; filtro a uno. La cola muestra el trabajo real2 en `running`/`mediacodec` y el sintético1 `ready`. La API de catálogo continuó200 mientras se procesaba el video.

La herramienta privada de catálogo selecciona MediaCodec explícitamente en la tablet donde se validó; el modo auto genérico continúa con remux para H.264/AAC compatible y libx264 en otros casos. No se inicia importación masiva de los496 capítulos, ni se marca ninguno como reproducible desde Drive privado. Se dispone de CLI por lotes1..20; falta integrar el control en el panel y la entrega pública.

## Estado confirmado al cerrar esta implementación

- Original real del episodio496 en Drive privado: **125635937 bytes**, MD5 remoto y local coinciden. Se añadió `original_remote` y `original_verified:true` a su metadata privada. La comprobación se hizo con hashes de Drive, porque `rclone check` espera directorios y no acepta comparar dos archivos con nombres diferentes.
- Variante H.264/MediaCodec: sigue procesándose en segundo plano. El trabajo está `running`; no se afirma que ya se subió ni que ya se reproduce públicamente.
- Repetir `catalogue-ingest --episode-id496 --enqueue` devuelve `already_queued:true` sin volver a descargar. Los campos de archivo original verificado se conservan al actualizar metadata.
- Pruebas completadas:36 de ingestión y11 de seguridad. La web pública cargó selección de perfiles; catálogo backend200 durante conversión. Motor y backend activos en PM2.
- Próximos pasos de producto: integrar controles de cola en panel, probar compatibilidad/calidad/rendimiento con más muestras, definir entrega pública y permisos para archivos privados; configurar client_id OAuth propio antes de lotes grandes, por el retiro del cliente compartido anunciado por rclone.

## Comprobación posterior de estado

Al consultar de nuevo, el job2 del capítulo496 terminó: `ready`, `mode_applied:mediacodec`, salida342354947bytes (unos342MB), remoto `pixel-drive:PixelNoSekai/Anime/59/11/episode.mp4`, `verified:true`, sin error. La fuenteAV1 original de125635937bytes sigue archivada. Ambos trabajos (muestra y capítulo real) estánready. PM2pixel-backend ypixel-media-worker online; catálogoHTTP200. Esto confirma descarga, conversión hardware y archivo privado verificado de un capítulo real, pero no su publicación/reproducción pública ni una importación masiva automática.
