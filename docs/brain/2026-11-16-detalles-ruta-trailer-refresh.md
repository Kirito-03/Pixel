# Detalles persistentes, tráiler Drive, acciones y refresco — 16 de noviembre de 2026

## Requisitos atendidos
- Refrescar la web con una ficha abierta debe conservar ese anime, en vez de perder el detalle y mostrar únicamente Inicio.
- El botón del tráiler debe aparecer si el archivo está en Drive, tanto en el componente web como Android.
- En pantallas estrechas, descripción y acciones no deben quedar tapadas por Ver episodio; tráiler como icono en la misma fila. Texto Play en el ancho más estrecho.
- Permitir actualizar las secciones de Android mediante gesto.
- Renovar destacados de manga, no mantener permanentemente los mismos cinco populares.
- Relacionados sin duplicados; priorizar otras temporadas identificables que existan en el catálogo.

## Implementación
- Query anime en la ruta de React Navigation, escrita por el detalle visible. MovieModal recupera el registro desde el catálogo al cargar esa ruta y muestra la animación de Pixel mientras espera. Se valida el identificador y el API sigue filtrando el catálogo público. Solo actúa en la pantalla enfocada y, para recuperación por enlace, en web. Cerrar limpia el parámetro; también desde Mi Lista.
- La selección de un relacionado se comunica desde AnimeSeriesModal al propietario del detalle/reproductor. Así el nuevo título, URL y episodios comparten identidad. No se remonta el detalle restaurado solo por cambiar a un relacionado ni se abre de nuevo al cerrar Mi Lista.
- services/animePresentation.ts resuelve Drive primero con URL /api/stream/Anime/<id>/trailer.mp4 y conserva YouTube alternativo cuando hay ID válido. Se reutiliza en hover web y detalle compartido. Se aceptan registros Drive aunque no tengan ID YouTube, se limpia la alternativa al cambiar título y no se transforma una URL MP4 en un enlace YouTube inválido.
- En móvil, hero y acciones en flujo adaptable, sin altura fija que corte las acciones. Reproducir se abrevia a Play con ancho inferior a 390 px. Mi Lista adapta su texto y el tráiler usa un icono de 44–48 px en la misma fila. El vídeo móvil dispone de proporción 16:9 y contenedor en flujo.
- Pull-to-refresh en Inicio, Buscar, Noticias Android, Emisión, catálogo de Manga, Mi Lista, catálogo restringido y ficha de lectura; la ficha anime ya tenía su refresco. Se vuelven a consultar los servicios del catálogo/cache, no se fuerza una extracción completa de todos los proveedores por cada gesto. El lector de páginas conserva su navegación y reintentos propios.
- Manga toma hasta 30 candidatos populares y elige cinco mediante selección determinista diaria. El carrusel sigue cambiando automáticamente entre destacados; cambiar el día renueva la selección sin peticiones por minuto (el temporizador solo comprueba la fecha local). El gesto permite consultar de nuevo los datos. Refresco separado de carga inicial para conservar la grilla mientras llega la respuesta; paginación reiniciada de forma deliberada al completar un refresco. Respuestas antiguas de paginación se descartan y cambiar de ancho ya no reinicia el catálogo.
- Relacionados: excluye el anime actual y repeticiones de IDs/títulos normalizados. Mantiene temporadas distintas aunque compartan ID de serie de TMDB o una traducción genérica. Si existe franchise_key usa ese grupo; sin él, agrupa conservadoramente títulos que solo difieren por marcas de Season, Final Season, Part, número secuencial o numeral romano. Otras temporadas identificadas van primero, ordenadas por estreno.
- Comprobación real: ninguno de los 899 registros activos tenía franchise_key al revisar. Por eso la alternativa por nombre es necesaria, pero NO constituye una relación canónica confirmada para toda la franquicia. Títulos completamente distintos y spin-offs requieren metadata de relaciones futura; no se etiqueta cualquier coincidencia de género como temporada.

## Pruebas y revisión
- 133 pruebas Node aprobadas, incluidas recuperación/cierre por enlace, pantallas inactivas, identificadores inválidos, cambio a relacionado sin otra restauración, propagación al propietario, Drive sin ID YouTube, duplicados y temporadas con mismo TMDB.
- TypeScript conserva solo los dos errores anteriores en services/offlineDownloads.ts por documentDirectory/cacheDirectory; no hay errores nuevos en estos cambios.
- Primera revisión Agy en modo plan/solo lectura encontró casos reales de cierre desde Mi Lista, cambio a relacionado, tráiler Drive sin YouTube, alternativa retenida, altura del vídeo y deduplicación de temporadas. Se corrigieron y añadieron pruebas. La segunda revisión Agy alcanzó su plazo sin respuesta final; no se presenta como una aprobación completada.
- Exportaciones y compilaciones secuenciales mediante comandos limitados de AGENTS.md, sin emulador ni aumento de límites. El primer paquete de trabajo no se publicó; se recompiló antes de preparar la publicación final.

## Validación web real
- A 360 × 800, Yamato conservó su ficha al recargar con ?anime=1. Otro caso, Boku no Hero Academia 6, conservó su ficha con ?anime=914 tras recargar.
- A 360 px los límites inferiores de Play, Mi Lista y tráiler quedaron entre y469 y y472; Ver episodio comenzaba en y490. No hay superposición; ancho del documento 360 px.
- Botón Ver tráiler de Yamato abrió un vídeo directo de Drive. Se observó readyState=4, paused=false, tiempo avanzando por 23,52 segundos sobre duración 30,09 y altura visible 202,5 px. No era un iframe de YouTube.
- Desde una ficha restaurada, pulsar Boku no Hero Academia 6 actualizó título y query anime=914; cerrar limpió la query y dejó cero diálogos.
- Desde Mi Lista se abrió Toaru (anime=52), se cerró y la ruta volvió a /mylist con cero diálogos, sin reapertura.
- En Boku no Hero Academia 6, los dos primeros relacionados reales fueron Boku no Hero Academia 7 y Boku no Hero Academia FINAL SEASON.
- Captura de reproducción: outputs/pixel-drive-trailer-mobile-117.jpg, en la carpeta de trabajo de este chat.

## Publicación y pendientes
- Web final desplegada por staging con respaldo y chunks anteriores conservados. Identidad del bundle mediante SHA de bytes reales, integrada en build-limited.
- SHA-256 del index final: 8a7718c6af8c5944c8e396ee9af1353b91ebc5c5e7e92cb54b7030e1d728e7e3.
- APK 1.0.16, código 17, 123585358 bytes; SHA-256 e714e260bd1d0184d88e0aeab7824f5641f78c98201cc72aa8b40598dfda35af. Firma de continuidad verificada antes de publicar.
- Descarga: https://pixelnosekai.com/api/app-release/android/download?build=17 . El manifiesto se reemplaza solo después de verificar SHA/tamaño del binario en el servidor.
- No había dispositivos ADB conectados. No se instaló ni se simuló la APK en un teléfono; pruebas de gestos y reproducción nativa física pendientes del usuario.
- No se reinició el backend, el túnel ni el bot de medios para estos cambios. Siguen separados los pendientes de telemetría por archivo/ETA y unificación AV1 del flujo legacy documentados en [[2026-11-16-detalle-y-drive-observabilidad]].


## Continuación de esta sesión
El comportamiento final de Play/Último disponible, contraste, estado activo y APK está en [[2026-11-16-detalle-contraste-y-lista]]. La1.0.16/código17 fue una publicación intermedia; fue sustituida por1.0.17/código18 sin reutilizar el código.
