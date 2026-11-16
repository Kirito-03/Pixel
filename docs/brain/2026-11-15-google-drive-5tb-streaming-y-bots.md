# Pixel: Almacenamiento Google Drive 5TB, Streaming VIP y Bots de Ingesta — 2026-11-15

## 1. Resumen Ejecutivo
Se implementó y puso en producción la arquitectura de almacenamiento propio y streaming de alto rendimiento utilizando una unidad de Google Drive de 5 TB (`pixel-drive:PixelNoSekai`) montada en el servidor `arle` (Android/Termux). Esta solución reemplaza la dependencia de servidores externos publicitarios y reproductores de terceros lentos, permitiendo reproducción nativa con carga instantánea y soporte de *byte-ranges* (HTTP 206 Partial Content).

Adicionalmente, se crearon e integraron los bots de ingesta automática y auditoría para Anime, Manga/Manhwa y contenido NSFW/Hentai.

---

## 2. Arquitectura de Streaming Google Drive (5TB)

### Flujo de Red
```
[Cliente App / Web]
       │ (HTTPS https://pixelnosekai.com/api/stream/...)
       ▼
[Cloudflare Tunnel]
       │ (HTTP localhost:8081)
       ▼
[Nginx en Servidor 'arle'] (Proxy inverso con Range headers y proxy_buffering off)
       │ (HTTP 127.0.0.1:8086)
       ▼
[rclone HTTP Daemon] (Servicio 'rclone-drive' bajo runsv de Termux)
       │ (Google Drive API v3)
       ▼
[pixel-drive:PixelNoSekai (5 TB)]
```

### Configuración del Servicio Nginx y Rclone
1. **Daemon Rclone:**
   - Ruta del servicio: `/data/data/com.termux/files/usr/var/service/rclone-drive/run`
   - Comando: `exec rclone serve http pixel-drive:PixelNoSekai --addr 127.0.0.1:8086 --read-only --vfs-cache-mode minimal`
   - Gestionado por `runsv` con reinicio automático ante caídas o reinicio del dispositivo.

2. **Bloque Nginx en `/data/data/com.termux/files/usr/etc/nginx/nginx.conf`:**
   ```nginx
   location ^~ /api/stream/ {
       proxy_pass http://127.0.0.1:8086/;
       proxy_set_header Host $host;
       proxy_set_header Range $http_range;
       proxy_set_header If-Range $http_if_range;
       proxy_http_version 1.1;
       proxy_buffering off;
       add_header Accept-Ranges bytes;
   }
   ```
   *Nota técnica:* Se usó el prefijo exacto `^~` para evitar que las reglas regex heredadas (`location ~ ^/(api|auth|...)`) interceptaran la petición y la desviaran a Express.

---

## 3. Bots de Ingesta y Auditoría

### A. Bot de Anime (`tools/pixel-drive-ingest.mjs`)
- **Resolución de Fuentes:** Prioriza servidores directos como MP4Upload y YourUpload usando `yt-dlp`.
- **Estrategia de Compresión Adaptativa:**
  - Si el video original pesa $\le 140$ MB: Aplica copia directa de streams con bandera `-movflags +faststart` (toma solo 2-3 segundos y 0 consumo de CPU).
  - Si el video original supera los 140 MB: Re-codifica a 720p ultra-liviano mediante `libx264` (CRF 26, preset `veryfast`, tune `animation`, AAC audio 96k, faststart). Reduce archivos de 350+ MB a ~70-80 MB sin pérdida perceptible de calidad.
- **Subida a Drive:** Almacena en `pixel-drive:PixelNoSekai/Anime/<animeId>/<epNum>/episode.mp4`.
- **Metadatos y Trailers:** Sube pósters (`poster.jpg`), banners (`banner.jpg`) y trailers oficiales descargados de YouTube (`trailer.mp4`).
- **Base de Datos:** Actualiza `anime_episodes` configurando `stream_url`, asignando `storage_type = 'gdrive'`, el tamaño en bytes `file_size` y registrando el servidor prioritario `Pixel VIP (Drive)`.

### B. Bot de Manga / Manhwa (`tools/pixel-drive-manga.mjs`)
- **Extracción:** Extrae listas de páginas de capítulos desde DragonTranslation y cache.
- **Descarga y Nombres:** Descarga secuencialmente las imágenes nombrándolas con ceros a la izquierda (`001.jpg`, `002.jpg`, etc.).
- **Subida:** Almacena en `pixel-drive:PixelNoSekai/Manga/<mangaSlug>/chapters/<chapterSlug>/`.
- **Base de Datos:** Actualiza `manga_page_cache` apuntando las URLs de cada página a `https://pixelnosekai.com/api/stream/Manga/...`.

### C. Bot de Hentai / NSFW (`tools/pixel-drive-hentai.mjs`)
- **Resolución:** Lee `hentai_episodes`, extrae enlaces de MP4Upload.
- **Procesamiento:** Descarga, aplica compresión 720p CRF 26 + faststart y sube a `pixel-drive:PixelNoSekai/Hentai/<hentaiId>/<epNum>/episode.mp4`.
- **Integración:** Inserta `{"server": "Pixel VIP (Drive)", "url": "..."}` en la primera posición de `video_servers` en `hentai_episodes`, permitiendo reproducción VIP directa en la pantalla `NSFWScreen`.

### D. Bot de Auditoría en Tiempo Real (`tools/pixel-drive-verify.mjs`)
- Cruza la base de datos PostgreSQL de `bd_pixel` contra el contenido en Drive.
- Genera un reporte desglosado con estados `✅ COMPLETO` vs `⚠️ INCOMPLETO` por serie, indicando el número de episodios/capítulos subidos versus el total planificado.

---

## 4. Visualización en el Panel de Administrador
1. **Dashboard Admin (`AdminDashboardScreen` y `/admin/dashboard.html`):**
   - Tarjeta métrica **"Episodios en Drive"** / **"Google Drive"**: Lee `storageStats` de `GET /api/admin/stats` filtrando `storage_type === 'gdrive'`.
2. **Gestor de Episodios (`EpisodeManagerScreen`):**
   - Muestra la insignia/badge `GDrive` con icono de nube para todos los episodios respaldados en Drive y la confirmación `Stream: OK`.

---

## 5. Pruebas y Endpoints Verificados en Vivo
- **Video Anime Ep 11:** `https://pixelnosekai.com/api/stream/Anime/59/11/episode.mp4` (HTTP 200/206, ~79.7 MB).
- **Poster Anime:** `https://pixelnosekai.com/api/stream/Anime/59/poster.jpg` (HTTP 200, 122 KB).
- **Trailer Anime:** `https://pixelnosekai.com/api/stream/Anime/5/trailer.mp4` (HTTP 200, ~8.6 MB).
- **Página Manhwa:** `https://pixelnosekai.com/api/stream/Manga/la-companera-de-clase-de-al-lado/chapters/capitulo-1/001.jpg` (HTTP 200, 426 KB).


---

## 4. Limpieza de Duplicados y Filas Dinámicas en Inicio

### A. Deduplicación de Animes
- **Causa identificada:** Los scrapers automáticos externos (como AnimeAV1) creaban entradas con sufijos de año (ej. `devil-may-cry-2026`). El bot no encontraba coincidencia de título e insertaba una nueva fila en `anime_content`. Luego, AniList normalizaba el título al oficial (`Devil May Cry`), generando múltiples registros idénticos en la base de datos (5 copias de *Devil May Cry*, 4 de *Super no Ura de Yani Suu Futari*, 2 de *BASTARD!!*, 2 de *Shingeki no Kyojin*).
- **Acción ejecutada:** El script `tools/pixel-dedup-animes.mjs` eliminó 75 episodios y 9 fichas duplicadas conservando la original con su ID principal. Base de datos ahora tiene **0 duplicados**.
- **Blindaje del bot:** Se actualizó `server/services/smartBotService.js` con normalización previa de candidatos y validación de colisiones contra títulos canónicos de AniList.

### B. Optimización de Filas de Inicio (`HomeScreen.tsx`)
- **Eliminación del Scroll Infinito:** Se removió la función que agregaba infinitas filas de géneros (`extraRows` / `loadMoreGenres`) que dejaban filas cortadas o semivacías.
- **Estructura fija y limpia:**
  1. Hero Carousel (5 animes rotativos).
  2. Continuar viendo (si hay progreso).
  3. Mi Lista (si hay favoritos).
  4. En emisión (Airing).
  5. Destacados (Top).
  6. Finalizados (Muestra aleatoria entre los 840+ animes).
  7. Recomendados (Top rating).
  8. Fila temática rotativa (ej. *Populares de Acción*, *Populares de Comedia*, etc. con catálogo completo).
- **Variación en cada recarga:** Se añadió soporte `sort=random` en `/api/catalog/anime`. Cada vez que el usuario abre o actualiza la app, la selección de títulos y el orden varían automáticamente.

---

## 5. Corrección del Hero Carrusel (Sin pérdida de calidad) y Automatización + Gestión de Drive en Admin

### A. Ajuste del Hero Carrusel en Web/Desktop (`components/AnimeArtwork.tsx` y `components/FeaturedMovie.tsx`)
- **Causa identificada:** `utils/animeArtwork.ts` limita la escala horizontal/vertical a `<= 1.35x` para conservar la nitidez de los banners panorámicos de AniList (`~1900x350-400`), lo que da una altura renderizada de `472-540px`. Al tener `FeaturedMovie.tsx` una altura de contenedor de `680px` en escritorio y `alignTop` en `top: 0`, el banner dejaba `140-210px` de fondo negro vacío en la parte inferior donde flotaban los botones, mientras la parte superior quedaba parcialmente tapada por el navbar. Además, `infoButton` heredaba `flexBasis: 0` del estilo móvil y truncaba `"MÁS INFORMACIÓN"` a `"MÁS INFORMA..."`.
- **Solución aplicada:**
  - En `utils/animeArtwork.ts` se ajustó el tope de escala a `<= 1.5` para que los banners panorámicos cubran el alto completo sin deformarse.
  - En `AnimeArtwork.tsx` se añadió `topOffset` con un contenedor recortado interior y anclaje fijo `top: 0` cuando `alignTop` está activo para iniciar exactamente debajo de la barra superior (`headerOffset = 72 px` en web desktop).
  - En `FeaturedMovie.tsx` se ajustó `heroHeight` en escritorio a `Math.min(610, Math.max(585, Math.round(height * 0.78)))` con `position="50% 0%"`, `paddingBottom: 48` y gradientes alineados a `top: headerOffset`, ubicando título, sinopsis (`numberOfLines: 3`) y botones sobre la imagen.
  - En los botones desktop se estableció `flexBasis: 'auto'` y `minWidth: 210` en `infoButton` para mostrar `"MÁS INFORMACIÓN"` completo.

### B. Estabilización de `rclone`, Ingesta Automática en Cron y Botones en el Admin
- **Servicio `rclone-drive` en `arle`:** Se detuvo un proceso manual duplicado (PID 9235) para permitir que el servicio supervisado `runsv rclone-drive` atienda `127.0.0.1:8086` (`--vfs-cache-mode minimal`).
- **Verificación HTTP instantánea y soporte batch:** `tools/pixel-drive-ingest.mjs`, `tools/pixel-drive-hentai.mjs` y `tools/pixel-drive-manga.mjs` ahora consultan primero `http://127.0.0.1:8086/...` con `curl -sI` (`<50ms` frente a `~10s` por CLI), respetan `--limit` en `--anime-id` y soportan `--batch` para Manga.
- **Vinculación inmediata de Hentai Ep 1:** `node tools/pixel-drive-hentai.mjs --episode-id 1` detectó `/Hentai/1/1/episode.mp4` (`80,171,512` bytes) ya alojado en Drive y actualizó `hentai_episodes` con `Pixel VIP (Drive)`.
- **Cron automático (`server/cron.js`):** Se añadió la tarea programada `15 */4 * * *` (`runDriveIngestBatch` con bloqueo `isDriveIngestRunning`) para subir lotes ligeros de Anime (`2`), Hentai (`1`) y Manga (`2`) a Drive automáticamente.
- **Endpoints y UI de reparación con 1 clic:**
  - `GET /api/admin/drive/inventory` ahora devuelve `pending` (`anime`, `manga`, `hentai` con conteos sincronizados/faltantes y `next_episode_id`) y `activeJobs`.
  - `POST /api/admin/drive/sync` inicia en segundo plano la subida por episodio, anime completo, manga, hentai o lote mixto (`409` si ya hay un trabajo activo).
  - Actualizados `services/adminApiService.ts`, `screens/admin/AdminDashboardScreen.tsx`, `screens/admin/EpisodeManagerScreen.tsx`, `server/admin/js/api.js`, `server/admin/dashboard.html` y `server/admin/js/dashboard.js`.

### C. Validaciones Reales vs Pendientes
- **Verificado en esta sesión:**
  - `node --check` sobre los 7 archivos JS/mjs modificados (exit 0).
  - `npx tsc --noEmit`: 0 errores en los archivos modificados (persisten 5 errores previos no relacionados en `components/Loader.tsx`, `hooks/useProfileManagement.ts` y `services/offlineDownloads.ts`).
  - `npm run build:web` (con `tools/build-limited.mjs`): compilación web completada y desplegada en `arle`; `https://pixelnosekai.com/` sirve `index-229e6a2d534fad35b7bf8011bac32628.js`.
  - `curl -sI http://127.0.0.1:8086/Hentai/1/1/episode.mp4` en `arle`: `HTTP/1.1 200 OK` (`Content-Length: 80171512`).
  - `GET /api/admin/drive/inventory` autenticado contra `http://127.0.0.1:3001` en `arle`: `HTTP 200` con `totalDriveItems: 3` (`Anime: 1`, `Manga: 1`, `Hentai: 1`) y listas `pending` (`anime: 20`, `manga: 20`, `hentai: 20`).
  - Log de PM2 `pixel-backend`: tarea `- Google Drive Ingest Batch: Cada 4 horas (minuto 15)` registrada al iniciar.
- **Pendiente de verificación visual / externa:**
  - Comprobación visual en navegador web del nuevo encuadre del Hero Carrusel, cabecera oscura `#050505`, flechas laterales ampliadas y reproducción directa de tráilers desde Drive tras limpiar caché del navegador.
  - Sincronización de esta nota con la bóveda de Obsidian (`/run/media/arle/Reze/Users/ASUS/My Documents/Projects/`), ya que el disco externo `/run/media/arle/Reze` no se encuentra montado actualmente.

---

## 6. Tráilers en Drive, Verificación Real, Blindaje Anti-Sobrescritura y Ajustes Visuales

### A. Bots Controlados y Verificación Real de Integridad en Google Drive
- **Limitación de recursos y estabilidad de red:**
  - En `tools/pixel-drive-ingest.mjs` y `tools/pixel-drive-hentai.mjs` se limitó `ffmpeg` a `-threads 2` y `rclone copyto` a `--transfers 1 --checkers 2 --bwlimit 8M`; se añadió `--force-ipv4`, `--socket-timeout 20`, `--retries 2` y `--no-playlist` en `yt-dlp` para evitar bloqueos por IPv6 en `arle`.
  - En `tools/pixel-drive-manga.mjs` se limitó `rclone copy` con `--transfers 2 --checkers 2 --bwlimit 8M`, con verificación de existencia HTTP real (`> 500` bytes en primera y última página) incluso sobre capítulos cacheados previamente con URLs de Drive.
- **Verificación real post-subida y auto-reparación (`tools/pixel-drive-verify.mjs --repair`):**
  - Antes de actualizar PostgreSQL, cada bot verifica el tamaño real del archivo subido vía `http://127.0.0.1:8086/...` (con respaldo `rclone ls`): episodio/hentai `>= 95%` del tamaño local optimizado y `> 102,400` bytes; tráiler `>= 95%` del local y `> 10,240` bytes; manga `> 500` bytes.
  - `pixel-drive-verify.mjs --repair` aborta sin modificar PostgreSQL si `127.0.0.1:8086` no responde, y en caso contrario limpia vínculos rotos/incompletos para re-encolarlos en Anime, Tráilers, Manga y Hentai.
- **Tráilers descargados a Drive (`--trailers`) y ciclo automático (`server/cron.js` + `server/routes/admin.js`):**
  - `syncAnimeImages` e `ingestBatchTrailers` en `tools/pixel-drive-ingest.mjs` descargan `Anime/<id>/trailer.mp4`, verifican integridad y actualizan `anime_content.trailer_site = 'gdrive'` manteniendo `trailer_id` como respaldo.
  - `server/cron.js` ejecuta secuencialmente cada `45` minutos (`*/45 * * * *`, más arranque a los `45 s`) `verify --repair`, `ingest --batch --limit 1`, `ingest --trailers --limit 2`, `hentai --batch --limit 1` y `manga --batch --limit 1` con exclusión mutua (`isDriveIngestRunning`).
  - `GET /api/admin/drive/inventory` suma `totalAnimeTrailers` al inventario y `POST /api/admin/drive/sync` (`type: 'batch'`) incluye `verify --repair` e ingesta de tráilers.

### B. Blindaje Anti-Sobrescritura en Scrapers y Caché
- **`server/services/hentaiBotService.js`:** `upsertEpisodesForHentai` conserva al inicio del array `video_servers` cualquier servidor `'Pixel VIP (Drive)'` ya vinculado cuando HentaiBot re-sincroniza episodios.
- **`server/services/smartBotService.js`:** al actualizar episodios existentes en `anime_episodes`, conserva `storage_type = 'gdrive'`, `stream_url` de Drive y el servidor `'Pixel VIP (Drive)'` al inicio de `external_servers`.
- **`server/services/mangaPageCache.js`:** las filas con URLs `/api/stream/Manga/` ya no caducan a las 6 horas ni son sobrescritas al consultar el capítulo.

### C. Reproducción Directa de Tráilers en Web/App y Ajustes de Inicio
- **Reproductores de tráiler (`components/TrailerPreview.web.tsx`, `components/TrailerPreview.tsx`, `components/MovieCard.tsx`, `components/anime-modal/useAnimeModal.ts`):**
  - Detectan URLs directas `https://pixelnosekai.com/api/stream/Anime/<id>/trailer.mp4` (`trailer_site === 'gdrive'`) para reproducirlas con `<video>` HTML5 nativo (control de silencio y desbloqueo por política de autoplay), con respaldo automático a `fallbackYoutubeId` si fallara el stream.
- **Más elementos al usar la flecha lateral y menú en negro oscuro:**
  - `services/catalogService.ts` eleva `limit` en `getHomeSections()` de `24` a `48`.
  - `screens/HomeScreen.tsx` eleva **Destacados** (`buildFeaturedItems`) de `12` a `28` títulos y evita recortar secciones por debajo de `28` elementos al deduplicar contra Destacados.
  - `components/AnimeArtwork.tsx` y `components/Header.tsx` cambian la franja/fondo superior de `#08080c` / transparente con tinte a negro `#050505` / `rgba(5, 5, 5, 0.88..0.96)`.

### D. Validaciones Reales de Esta Fase
- `node --check` sobre los 9 archivos backend/scripts modificados: exit `0`.
- `npx tsc --noEmit` filtrado sobre `TrailerPreview`, `MovieCard`, `useAnimeModal`, `AnimeHeroSection`, `HomeScreen`, `catalogService`, `AnimeArtwork`, `Header`: `0` errores.
- `node --test server/tests/trailers.test.mjs tests/trailerPreview.test.mjs tests/mangaReaderReliability.test.mjs`: `14/14` tests en verde.
- `npm run build:web` (vía `tools/build-limited.mjs`) desplegado en `arle`; `https://pixelnosekai.com/` sirve `index-50668512b64368e412c928e70726bfee.js`.
- En `arle`:
  - `Anime/5/trailer.mp4` (`8,982,620` B), `Anime/2/trailer.mp4` (`4,835,731` B) y `Anime/3/trailer.mp4` (`5,793,940` B) respondieron `HTTP/2 200` (`content-type: video/mp4`) en `https://pixelnosekai.com/api/stream/...`, y `/api/catalog/anime/5` devolvió `trailer_site: 'gdrive'`.
  - `Hentai/1/1/episode.mp4` (`80,171,512` B) respondió `HTTP/2 200` y quedó re-vinculado con `'Pixel VIP (Drive)'`.
  - `node tools/pixel-drive-verify.mjs --repair` finalizó en `0` con `Anime Episodios: 1/1`, `Anime Trailers: 3/3`, `Manga Capítulos: 1/1` y `Hentai Episodios: 1/1` íntegros (`0` rotos).
- **Nota:** Después de validar `build:web`, se aplicaron únicamente cambios de servidor (`hentaiBotService.js`, `smartBotService.js`, `mangaPageCache.js`) desplegados directamente en `arle` y reiniciados con `pm2 restart pixel-backend --update-env` (el bundle web no cambió respecto a `index-50668512b64368e412c928e70726bfee.js`).

---

## 7. Auditoría de Ciberseguridad y Corrección de Vulnerabilidades

### A. Hallazgos Corregidos
1. **[ALTA-1] Open Redirect en OAuth Callback y Validación de Rol en `/auth/admin/me` y `/auth/admin/check` (`server/routes/auth.js`):**
   - `isAllowedMobileRedirect` restringe `redirect_uri` exclusivamente a esquemas `pixelnosekai://` o `exp://` sin `@` ni `//localhost`.
   - `/auth/admin/me` y `/auth/admin/check` ahora exigen `decoded.role === 'admin'` o email incluido en `ADMIN_EMAILS`.
2. **[ALTA-2] Restricción de `/uploads/imports`, `/uploads/episodes` y `.m3u` (`server/app.js`, `server/routes/content.js`):**
   - Se limitó `express.static` público únicamente a `/uploads/avatars`; `/uploads/imports`, `/uploads/episodes`, `/videos/animes_madre.m3u`, `/content/m3u` y `/health/db` requieren `authenticateAdmin`.
3. **[ALTA-3] Protección Anti-SSRF en Transcodificación e Importación M3U (`server/routes/transcode.js`, `server/services/transcodeHlsService.js`, `server/services/animeImportService.js`):**
   - Bloqueo de `localhost`, `.local`, `.internal`, loopback (`127.0.0.0/8`, `::1`, `0.0.0.0`), link-local (`169.254.0.0/16`, `fe80:`) y redes privadas (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`), además de `-protocol_whitelist http,https,tls,tcp` en `ffmpeg` para fuentes remotas.
4. **[MEDIA-2] Prevención de DOM XSS en Admin clásico (`server/admin/js/import.js`, `server/admin/js/dashboard.js`):**
   - Se escapa `it.title` y `se` con `escapeHtml()` en `import.js` y se valida `item.url` con `sanitizeUrl()` (`https://`, `http://` o `/`) en `dashboard.js`.
5. **[MEDIA-3] y [BAJA-1,2,3] Endurecimiento de Límites, Logs y Consultas (`server/app.js`, `server/routes/admin.js`, `server/routes/nsfw.js`, `server/routes/progress.js`, `server/routes/resumeTarget.js`):**
   - Límite global de `express.json`/`express.urlencoded` reducido de `50mb` a `2mb` (conservando `50mb` solo en `/api/admin/import/m3u/text`).
   - Deduplicación en memoria (`inFlightHentaiSyncs`) y filtro `/^[a-z0-9-]+$/i` para scraping on-demand en `/api/nsfw/details/:slug`.
   - Eliminado el log de `req.headers` (que exponía `Authorization: Bearer <JWT>`) y los `CREATE TABLE`/`CREATE INDEX` por petición en `progress.js` y `resumeTarget.js`.
   - URL base fija (`process.env.PUBLIC_BASE_URL || 'https://pixelnosekai.com'`) en `POST /api/admin/episodes/:id/upload-video`.

### B. Validaciones Reales
- `node --check` sobre los 12 archivos JS modificados: exit `0`.
- `node --test server/tests/security-routes.test.cjs server/tests/uploads-security.test.mjs server/tests/trailers.test.mjs server/tests/legacyAnimeMetadata.test.mjs`: `24/24` tests en verde (incluyendo bloqueo SSRF en `/transcode/hls`).

---

## 8. Prioridad a Imágenes/Tráilers y Completado Serie por Serie antes de Avanzar
- **Imágenes y tráilers primero (`server/cron.js`, `server/routes/admin.js`, `tools/pixel-drive-*.mjs`):**
  - El ciclo automático y el botón `⚡ Subir Lote` ahora ejecutan primero `pixel-drive-ingest.mjs --trailers --limit 5` (subiendo `poster.jpg`, `banner.jpg` y `trailer.mp4`, que son livianos y rápidos) antes de pasar a los videos completos.
  - En `pixel-drive-manga.mjs` (`syncMangaCover`) y `pixel-drive-hentai.mjs` (`syncHentaiCover`) también se sube primero la portada (`cover.jpg` / `poster.jpg`) de cada obra antes de sus capítulos/episodios.
- **Completar todos los capítulos de un título antes de pasar al siguiente:**
  - En `tools/pixel-drive-ingest.mjs` (`--batch`), `tools/pixel-drive-manga.mjs` (`ingestBatchManga`) y `tools/pixel-drive-hentai.mjs` (`--batch`), la consulta CTE (`target_anime`, `target_manga`, `target_hentai`) fija un único título activo —priorizando cualquier obra que ya tenga capítulos parcialmente en Drive (`synced_count > 0`)— y sube todos sus episodios/capítulos en orden (`episode_number ASC` / `chapter ASC`) hasta terminarla al 100 % antes de pasar a la siguiente.

---

## 9. Presentación, Colores, Categorías en Manga, Cierre Android y Miniaturas de Capítulos

### A. Presentación, Colores y Corrección Android
- **Eliminación del exceso de degradado blanco (`components/CatalogHero.tsx`, `components/AnimeSeriesModal.tsx`, `components/AnimeSeriesModalStyles.ts`, `components/FeaturedMovie.tsx`):**
  - El hero mantiene los colores naturales de la ilustración y un sombreado oscuro suave detrás del texto blanco incluso en modo claro, con una transición corta al fondo (`colors.background`) únicamente en el borde inferior (`locations=[0, 0.72, 0.91, 1]` / `[0, 0.45, 0.72, 0.9, 1]`).
  - `FeaturedMovie.tsx` adapta dinámicamente la altura en escritorio según la proporción natural de la imagen (`Image.getSize`), manteniendo nítidos los banners panorámicos `1900x400` sin estirarlos y dando mayor altura a imágenes ~`1920x800`.
- **Fondo del detalle en móvil/Android (`components/AnimeSeriesModal.tsx`):**
  - En pantallas pequeñas (`isSmallScreen`) se omite el banner horizontal y se prioriza el póster vertical con encuadre por anime (`poster_position || '50% 18%'`), manteniendo intacto el diseño de escritorio.
- **Corrección del destello blanco al cerrar detalle en Android (`components/AnimeSeriesModal.tsx`):**
  - `<Modal>` ahora usa `transparent` en todas las plataformas (con `animationType="none"` y animación interna de `fadeAnim`/`slideAnim` sobre fondo `colors.background`), evitando que al desvanecerse quede expuesto el fondo blanco del diálogo nativo de Android.
- **Colores sin verde y simplificación de Manga (`components/Loader.tsx`, `components/LoadingScreen.tsx`, `screens/MangaScreen.tsx`, `server/routes/manga.js`, `server/services/mangaService.js`, `services/mangaApi.ts`):**
  - Se reemplazó `#83bdb4` en `Loader.tsx` y `LoadingScreen.tsx` por `PIXEL` en rojo (`colors.primary`) y `NO SEKAI` / fichas en blancos/grises según tema.
  - En `MangaScreen.tsx` se retiraron las filas horizontales de chips y se colocó el botón **Categorías** junto al buscador, abriendo un panel táctil/modal con filtros por **Estado**, **Formato** y **Género** (conectado a `genre` en `mangaService.js` y `manga.js`).

### B. Miniaturas Reales de Capítulos en Drive
- **`tools/pixel-drive-ingest.mjs` + `server/cron.js` + `server/routes/catalog.js`:**
  - Tras verificar la subida de `episode.mp4`, `generateAndUploadEpisodeThumbnail()` mide duración con `ffprobe`, elige una sola vez un instante aleatorio entre los minutos `6` y `19` (`360–1140 s`, adaptado si dura menos), extrae 1 solo fotograma JPEG (`480x270`, `-frames:v 1`, sin recodificar el video), sube `Anime/<animeId>/<epNum>/thumb.jpg` y guarda `thumbnail_url` en `anime_episodes`.
  - `--thumbnails --limit 1` (ejecutado 1 a la vez en `cron.js`) genera miniaturas pendientes de capítulos ya alojados en Drive leyendo vía HTTP range-seek sobre `http://127.0.0.1:8086/...`.
  - `AnimeSeriesModal.tsx` y `AnimeSeriesModalStyles.ts` muestran la miniatura horizontal `112x63` con etiqueta numérica en la esquina y una alternativa neutra (`colors.surfaceElevated` + icono `film-outline`) cuando aún no hay miniatura en Drive.

### C. Validaciones Reales
- `node --check` + `npx tsc --noEmit` (0 errores en archivos editados) + `33/33` tests en verde (`trailers`, `security-routes`, `mangaReaderReliability`, `trailerPreview`, `featuredArtwork`, `animeArtwork`).
- **Consumo en tablet (`arle`) al generar miniaturas (`node tools/pixel-drive-ingest.mjs --thumbnails --limit 1`):**
  - Ep `#1`: `3.78 s` de `ffmpeg`, `24,003 B` (`HTTP/2 200` en `https://pixelnosekai.com/api/stream/Anime/1/1/thumb.jpg`).
  - Ep `#496`: `3.19 s` de `ffmpeg` (`5.13 s` CPU usuario total, `18,143 B`, `HTTP/2 200` en `https://pixelnosekai.com/api/stream/Anime/59/11/thumb.jpg`), **1.87 GB RAM disponible** de 3.82 GB.
- **Inspección visual en navegador (`https://pixelnosekai.com/`, `index-0a032e0441f8ce000fbbafc9623acc6a.js`):**
  - Hero modo oscuro y claro con colores vivos y transición corta, botón **Categorías** en Manga con Estado/Formato/Género, miniatura real 16:9 en Ep. 1 de Anime #1, y detalle móvil (`390x844`) con póster vertical y cierre limpio sin pantalla blanca.
- **Pendiente para APK Android:** JDK 21 (`java`/`javac`) no se encuentra instalado en esta laptop; falta instalar OpenJDK 21 para ejecutar `npm run build:android` con `JAVA_HOME` apuntando a JDK 21.





---

## 10. Ajustes de Cabecera, Hero en Modo Claro, "Detener tráiler", Carrusel en Mi Lista y Rediseño de Tarjetas Manga

- **Botón `"Detener tráiler"` compacto (`components/AnimeSeriesModalStyles.ts`, `components/AnimeSeriesModal.tsx`):** Se eliminó `right: 16` de `trailerCloseButton` y se aplicó `left: 16, alignSelf: 'flex-start'` para evitar que se estirara al 100% del modal en React Native Web.
- **Cabecera sólida en modo claro y oscuro (`components/Header.tsx`, `screens/MangaScreen.tsx`, `screens/MyListScreen.tsx`):** `MangaScreen` y `MyListScreen` ahora pasan `black` (igual que `NSFWScreen`) y `Header.tsx` usa `'rgba(255, 255, 255, 0.96)'` en modo claro / `'rgba(5, 5, 5, 0.96)'` en modo oscuro para evitar barras transparentes al hacer scroll.
- **`CatalogHero` en modo claro (`components/CatalogHero.tsx`):** Cuando `theme === 'light'` y no hay banner panorámico (`lightPortrait`, usado en Manga y Hentai), `AnimeArtwork` usa `colors.background` en lugar de `#050505`, el texto pasa a color oscuro legible y la transición inferior se acorta al 10% (`locations={[0, 0.9, 1]}`) para no lavar la parte inferior del póster vertical.
- **Carrusel `<` / `>` en `"Continuar viendo"` (`screens/MyListScreen.tsx`):** Se amplió el límite a 30 ítems y se añadieron botones laterales `<` y `>` en escritorio para navegar horizontalmente en ambas direcciones.
- **Rediseño `MangaCard` y Plan B sin portada (`components/MangaComponents.tsx`, `server/services/mangaService.js`):**
  - Título, capítulo (`Cap. X`) y formato/fecha ahora viven dentro de la parte inferior de `posterBox` sobre un gradiente compacto (`44%` inferior), con estado `hovered` en web sin tapar el arte superior.
  - `PremiumCoverFallback` reemplaza el antiguo badge duplicado `ONGOING` por un monograma limpio con iniciales del título, barra roja de acento y etiqueta de formato.
  - En `server/services/mangaService.js`, `resolveFallbackMangaCover()` y `backfillMissingMangaCovers()` consultan AniList GraphQL y MangaDex cuando `cover_url` llega vacío.
- **Validaciones reales:**
  - `npx tsc --noEmit` (0 errores nuevos; solo 2 preexistentes en `services/offlineDownloads.ts:83`), `node --check server/services/mangaService.js`, `node --test tests/*.mjs` (**122/122** en verde).
  - `npm run build:web -- --output-dir dist` (`index-7a6c7e488be63c12c1350782b4d944eb.js`) desplegado en `arle` con `pm2 restart pixel-backend`.
  - Verificación visual en `https://pixelnosekai.com/` (escritorio `1280x800`, modo claro): `"Detener tráiler"` compacto (`153.8px`), `CatalogHero` claro sin caja negra ni niebla blanca en Manga y Hentai, `Header` blanco sólido al hacer scroll en Manga/Hentai/Mi Lista, `MangaCard` con texto integrado e ítem sin portada (`Toxicólogo del Clan Tang de Sichuan`) con monograma limpio sin badge duplicado, y flechas `<` / `>` funcionales en `Continuar viendo`.

---

## 11. Limpieza de Modo Claro, Sinopsis Única y Publicación APK `1.0.15 (16)`

- **Modo claro refinado y sinopsis única (`components/FeaturedMovie.tsx`, `components/AnimeSeriesModal.tsx`, `components/MovieCard.tsx`, `utils/briefSynopsis.ts`):**
  - Se redujo el velo blanco en modo claro tanto en `FeaturedMovie.tsx` como en `AnimeSeriesModal.tsx` y el popup hover de `MovieCard.tsx` (`rgba(255,255,255,0.42)` en el `40%` inferior).
  - Se centralizó `cleanSynopsisText()` en `utils/briefSynopsis.ts` para eliminar `(Source: ...)`, `(Fuente: ...)` y nombres de plataformas externas.
  - En `AnimeSeriesModal.tsx` se eliminó la segunda sinopsis duplicada debajo de las tarjetas de metadatos y la descripción única del hero usa `ScrollView` compacto (`maxHeight: 68`/`78`) para leer textos largos sin agrandar el hero.
- **Compilación y publicación APK Android (`app.json`, `android/app/build/outputs/apk/release/app-release.apk`):**
  - Compilada con `npm run build:android` usando JDK 21 (`/home/arle/Documents/Codex/2026-11-13/primero-lo-urgente-renueva-hoy-30-2/work/jdk21`), versión `1.0.15` (`versionCode: 16`).
  - Empaquetada con `tools/android-release.mjs package`, subida a `arle` (`pixel-1.0.15-16.apk`, `123,557,802` bytes, SHA256 `1557919a565b771085b0a85fcae40e58a2be642eab74e0521e20eb7f1faa5369` verificado en destino antes de publicar `latest.json`).
