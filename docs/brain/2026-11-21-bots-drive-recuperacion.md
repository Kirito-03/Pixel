# Recuperación y estabilidad de bots y enlaces de Google Drive (2026-11-21)

## Causa raíz diagnosticada en producción (`arle`)
1. **Pérdida de enlaces en PostgreSQL durante caída de red**: el 2026-11-20 (`19:25..20:54` EST), `tools/pixel-drive-verify.mjs --repair` ejecutó comprobaciones por archivo (`curl` + `rclone ls`) mientras la tablet sufrió pérdida de WiFi/DNS (`ENOTFOUND`). Los fallos transitorios devolvieron `0` bytes y `--repair` interpretó los archivos como ausentes, borrando los enlaces VIP de Drive en `anime_episodes`, `anime_content.trailer_site`, `hentai_episodes.video_servers` y `manga_page_cache`, aunque los archivos seguían intactos en `pixel-drive:PixelNoSekai`.
2. **Bloqueo posterior del puente Drive HTTP (`127.0.0.1:8086`)**: `rclone serve http` carecía de timeouts explícitos (`--contimeout`/`--timeout`) y la comprobación previa de `pixel-drive-verify.mjs` fallaba tras `2 × 12s`, saltando todos los lotes automáticos desde `21:50` hasta `00:50`.
3. **Keepalive en `crond`**: `~/server/tools/tablet-pixel-keepalive.sh` invocaba `pm2` sin `LD_PRELOAD` de `termux-exec` ni `node "$PREFIX/bin/pm2"`, fallando cada 2 minutos con `/usr/bin/env: bad interpreter`.
4. **Scrapers en Termux/Android**: `server/services/jkanimeScraper.js` llamaba `cloakbrowser.launch()` (`Unsupported platform: android`) y `smartBotService.syncNextCatalogPage()` seguía avanzando páginas vacías (`70..72`) hasta `120`.

## Cambios aplicados
- **[`tools/lib/drive-verify.mjs`](file:///home/arle/Documentos/Projects/pixel/tools/lib/drive-verify.mjs) y [`tools/pixel-drive-verify.mjs`](file:///home/arle/Documentos/Projects/pixel/tools/pixel-drive-verify.mjs)**:
  - Reemplazada la comprobación archivo por archivo por un único inventario autoritativo (`rclone lsjson -R --files-only --contimeout 15s --timeout 90s`). Si `rclone` falla o devuelve JSON inválido, aborta sin tocar PostgreSQL.
  - Guardián `canSafelyApplyRepair()` que impide limpiezas masivas en `--repair` cuando el inventario está vacío o fallan el 100 % de enlaces activos sin `--force`.
  - Nuevo modo `--restore` para reconstruir en PostgreSQL enlaces de episodios anime, miniaturas, trailers, episodios H y capítulos contiguos completos de manga existentes en Drive.
  - Sondeo de `http://127.0.0.1:8086` ampliado (3 intentos × 20 s sobre `/` y `/Anime/`).
- **Resiliencia de colas Drive**:
  - `--contimeout 15s --timeout 30s` en `rclone ls` dentro de [`tools/pixel-drive-ingest.mjs`](file:///home/arle/Documentos/Projects/pixel/tools/pixel-drive-ingest.mjs), [`tools/pixel-drive-hentai.mjs`](file:///home/arle/Documentos/Projects/pixel/tools/pixel-drive-hentai.mjs) y [`tools/pixel-drive-manga.mjs`](file:///home/arle/Documentos/Projects/pixel/tools/pixel-drive-manga.mjs).
  - En `--batch` de anime y H, consulta de candidatos ampliada para no atascar el lote completo detrás de un único enlace MP4Upload muerto.
- **Scrapers y keepalive Termux**:
  - Respaldo `axios` en [`server/services/jkanimeScraper.js`](file:///home/arle/Documentos/Projects/pixel/server/services/jkanimeScraper.js) cuando `process.platform === 'android'` o `cloakbrowser` lanza `Unsupported platform`.
  - Reinicio automático de `lastCatalogPage = 1` en [`server/services/smartBotService.js`](file:///home/arle/Documentos/Projects/pixel/server/services/smartBotService.js) al alcanzar una página vacía (`foundTotal === 0` en página > 1), conservando la página actual si hay error de red.
  - [`tools/tablet-pixel-keepalive.sh`](file:///home/arle/Documentos/Projects/pixel/tools/tablet-pixel-keepalive.sh) (y copia activa `~/server/tools/tablet-pixel-keepalive.sh`) exporta `libtermux-exec-ld-preload.so` y ejecuta `node "$PREFIX/bin/pm2" jlist`.
  - Servicio `rclone-drive/run` en `arle` actualizado con `--contimeout 15s --timeout 30s --dir-cache-time 5m`.

## Validaciones reales ejecutadas
- **Pruebas locales Node**: `node --check` sobre los 7 módulos modificados + `node --test tests/*.mjs tools/lib/*.test.mjs` -> `246` pruebas pasadas, `0` fallos (incluyendo [`tests/driveVerifySafety.test.mjs`](file:///home/arle/Documentos/Projects/pixel/tests/driveVerifySafety.test.mjs)). *(Nota: en `server/tests/*.test.*`, `security-routes.test.cjs` tuvo `1` fallo previo no relacionado al probar fetch de portada externa: `502 !== 200`, `23/24` pasaron).*
- **Keepalive bajo entorno mínimo en `arle` (`env -i`)**: salida `0` y sin nuevos errores en `~/server/logs/pixel-keepalive.log` tras el despliegue (`mtime 00:54:04`).
- **Recuperación `--restore` y verificación en `arle`**:
  - Inventario detectado en `pixel-drive:PixelNoSekai`: `5,257` archivos (`eps=37`, `thumbs=37`, `trailers=123`, `hentai=17`, `mangaCols=73`).
  - Restaurado en PostgreSQL: `37` episodios de anime (`thumbnail_url` ya conservaba `37`), `123` trailers, `17` episodios H y `57` capítulos completos de manga (`16` carpetas manga omitidas por `no-db-chapter-match`, ej. sufijos `capitulo-*_1`).
  - Verificación posterior: `234 comprobados | 234 OK | 0 rotos`.
- **Ejecución viva tras reinicio de `pixel-backend`**:
  - `pixel-backend`, `pixel-media-worker`, `rclone-drive`, `rclone serve webdav`, `cloudflared` y `crond` activos.
  - A las `00:58:49`, `[CronDrive]` completó `Verificación de Drive: done` e inició en paralelo `pixel-drive-ingest.mjs --batch --limit 2` (`Anime/2/1/episode.mp4`) y `pixel-drive-manga.mjs --batch --limit 8` (`Manga/me-gustan-los-pechos-de-mi-hermana/chapters/capitulo-2`).

## Pendiente por observar
- Esperar al próximo ciclo cron de `Sync Catalog Incremental` (cada 10 min) y `Update Ongoing` (cada 4 h) para confirmar en logs el reinicio de página de catálogo (`72 -> 1`) y las consultas `axios` de JKAnime sin error de plataforma.
