# 2026-11-16: Lector Manga, Panel Admin Web y APK 1.0.21 (22)

## Resumen
1. **Lector de Manga (`screens/MangaReaderScreen.tsx`, `utils/nativeReaderHtml.ts`, `components/NativeMangaPages.tsx`):**
   - La barra de título y capítulo vive al inicio del lector (`ScrollView` en Web / controlada por `atTop` en Android `WebView`), ocultándose al desplazarse hacia abajo y volviendo al inicio.
   - Se agregó un botón flotante lateral **↑ Inicio** (`showFloatingTop` > 160 px en Web, `.float-top` fijo en Android `WebView`) que acompaña al usuario al deslizar y regresa suavemente arriba, manteniendo también el botón **↑ Ir al inicio** al final del capítulo.
2. **Panel Administrador Web sin pantalla en blanco ni 404 (`server/app.js`, `dist/`):**
   - Se corrigió la desincronización entre `dist/index.html` y el chunk `__common-*.js` (causante de respuesta HTML en el script JS) y se reexportó `dist/` limpio.
   - Se añadieron rutas SPA de respaldo en `server/app.js` (`/admin/login`, `/admin/dashboard`, `/admin/import`, `/admin/anime`, `/admin/anime/form`, `/admin/episodes`, `/admin/bot`) para servir `dist/index.html` tras `express.static(adminDir)` en recargas directas sin romper `/admin/`.
3. **Compilación y publicación APK 1.0.21 (`versionCode: 22`):**
   - Compilada con `npm run build:android` limitado (`2 CPU`, `4 GiB`, `1` tarea) usando JDK 21 local.
   - Tamaño: `123,601,858` bytes; SHA256 verificado en `arle` antes de publicar `latest.json`: `6710575d86b4e9c37b0795632e14bf46d54f29264994e722b8c6aef1d6055fb8`.
   - Firma verificada idéntica a `1.0.1`–`1.0.20` (`a391822e88a2d7c3` / certificado `CN=Android Debug` SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`), `zipalign` OK, `AndroidManifest.xml` idéntico al de `1.0.11`.

## Validaciones
- `node --check server/app.js`
- `node --test tests/*.mjs`: **170/170** pruebas en verde.
- `npx tsc --noEmit`: 0 errores nuevos (solo los 2 preexistentes en `services/offlineDownloads.ts:83`).
- `curl -sI https://pixelnosekai.com/admin/dashboard` y `/admin/`: **HTTP/2 200**.
- `curl -s https://pixelnosekai.com/api/app-release/android`: **HTTP/2 200** (`version: 1.0.21`, `versionCode: 22`).
