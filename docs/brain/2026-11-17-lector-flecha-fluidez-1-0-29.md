# Lector: flecha y desplazamiento — 1.0.29 (31)

- Flecha flotante sin texto visible, área táctil de 44 px y radio de 6 px. Mantiene etiqueta accesible «Ir al inicio».
- Se oculta al bajar y reaparece al subir deliberadamente, fuera de los primeros 160 px. Histéresis: 56 px hacia abajo / 32 px hacia arriba, ignora ruido menor de 2 px. Android mantiene transición de opacidad/desplazamiento y respeta movimiento reducido.
- Web usa el mismo controlador de dirección del menú; no se cambian los botones de navegación al principio y final del capítulo.
- Android deja de recorrer todas las páginas en cada fotograma: búsqueda binaria sobre posiciones actuales (incluye cambios de altura de imágenes). Solo envía la página cuando cambia. Fuente HTML de WebView memorizada entre renders.
- No reduce resolución ni comprime las imágenes originales. La reducción de trabajo JavaScript no demuestra por sí sola que desapareció todo el lag en el teléfono.

## Verificaciones

217 pruebas Node aprobadas, incluida dirección de flecha, pequeños cambios, página sin duplicados y máximo 11 lecturas de posiciones para un capítulo de 1024 páginas. Comprobación física de fluidez pendiente. APK compilada con wrapper limitado en 2m50s; firma fijada y alineación verificadas. Código 31, 123643310 bytes, SHA256 `9af370f146e9c73f5fce3c9ed3d35197ed675a2db14e51c619a2776c911be773`. Publicada; descarga pública completa HTTP200,123643310 bytes en8.93s; SHA256 coincide con el original firmado. Web final:44 archivos verificados, publicación atómica; SHA256 HTML público `588b4395796d5a610efffe16b479eb8053934370b697d4870c9f69efaf1a5f90`. No instalada: teléfono ausente en ADB.

agy detectó un caso de flecha web que reaparecía al bajar cerca de160 px: se reinicia el historial de dirección por debajo de ese umbral; prueba de regresión aprobada. TypeScript mantiene solo los dos errores previos de offlineDownloads.ts:83. Se restauró acceso a Obsidian y se copiaron las notas pendientes1.0.26–28.
