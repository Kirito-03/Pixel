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
