# Buscador universal y filas separadas — 13 noviembre 2026

## Decisión del usuario

Subir todos los cambios de código a Git. Hentai debe tener una distribución parecida a Inicio, sin buscador propio. El buscador universal accesible desde la cabecera de Inicio incluye anime y manga. Manga conserva además su búsqueda interna. Los registros adultos pertenecen exclusivamente a su sección y no aparecen en Inicio ni en el buscador general, aunque el perfil active +18.

## Implementación

- Hentai: destacado con acción de abrir ficha y filas horizontales de12registros, con flechas de escritorio y desplazamiento táctil. IDs/slugs deduplicados entre filas; se muestran todos los registros recibidos. Diseño de esquinas rectas y sin contornos. No hay TextInput ni búsqueda local en esta página.
- La cabecera usa el mismo acceso Buscar de la aplicación. No se añadió un buscador de contenido adulto ni se consultaron fuentes externas.
- `universalSearch` consulta anime y manga con la misma consulta normalizada; las sugerencias salen de esos mismos resultados. Debounce350ms, caché pública5minutos con máximo40consultas y deduplicación de peticiones simultáneas. Una fuente puede fallar y dejar disponibles los resultados de la otra; el error se muestra y permite reintentar. Los fallos y respuestasparciales no se cachean como éxitos.
- Resultados discriminados por tipo y clavecompuesta: `anime:ID` y `manga:ID` no colisionan. Seleccionar manga abre MangaDetail; seleccionar anime abre su ficha existente. Manga conserva su buscador interno.
- Política de catálogo general: exclusión de banderasadultas y etiquetas/ratingsexplícitos en listados, búsqueda, portada de Inicio y detalle de anime. La exclusión no depende de adultContentEnabled. La sección separada mantiene sus propias consultas y guard porperfil.

## Verificación

-39pruebasNode correctas: separación de contenido, manga/anime, IDs coincidentes, consultas cortas, caché/concurrencia, fuente fallida, respuesta inválida y reintento; más regresiones previas de seguridad, lista, imágenes y trailers.
- CompilaciónExpoWeb verificada. TypeScript global mantiene errores anteriores en reproductor, descargas y otros módulos, sin errores en los nuevos módulos de búsqueda/filas.
- Comprobación posterior del backend: `/api/nsfw/latest?status=Todos` ya devuelveHTTP200 y43registros. Esto actualiza las notas antiguas que observaban404/tablas ausentes. No se inspeccionaron ni descargaron vídeos para la comprobación.
- La pestaña original del navegador no puede controlarse con el conector actual; la pestaña de prueba queda en selección de perfil. La revisión visual completa con sesión real no se presenta como completada.
- PublicaciónGit incluye todos los cambios de código/documentación pendientes. Credenciales, archivos audiovisuales y cachés/artefactos generados quedan fuera. Las diferencias de archivos ya versionados en server/hls y server/videos permanecen locales.
