# Emisión, búsqueda e imágenes de Inicio — 15 de noviembre de 2026

## Pedido y decisiones implementadas

Rediseñar Emisión y Buscar en web/Android con menos rojo y menos marcos; conservar la identidad y dar a Android una presentación compacta propia. Mejorar las imágenes borrosas de Inicio.

- Emisión: ancho máximo1280, seis columnas en escritorio y dos en teléfono; portadas con títulos de dos líneas, puntuación discreta y metadatos fuera de la imagen. Se retiran los rótulos SUB/N/A y el encabezado «HOY» que agrupaba todo el catálogo. Controles neutros con acento verde grisáceo y calendario semanal explícitamente en horario de Japón.
- Búsqueda: ancho máximo1200, géneros en español, filtros Todo/Anime/Manga, resultados directos sin sugerencias flotantes que tapaban los filtros. Se mantienen el historial sincronizado por cuenta/perfil y la exclusión del catálogo H de la búsqueda pública. Android usa «Explorar», encabezado/campo más bajos, sin autofocus y cuadrícula de dos columnas. No se cambian las tarjetas ni el hover de Inicio.
- Calendario: una ficha externa abre información y comprueba coincidencia en el catálogo antes de abrir episodios. Los IDs de MAL no se usan como IDs internos de Pixel. Hay estados de carga/error/reintento y protección contra respuestas tardías.
- Inicio: se reutiliza AnimeArtwork, con proporción conservada y límites de ampliación ya existentes. En escritorio se prefieren banners reales; en teléfono se conserva el encuadre de portada. El carrusel prioriza elementos con imágenes apropiadas antes de elegir cinco de la lista barajada.
- Importación Jikan: los nuevos registros eligen el póster de mayor tamaño disponible y dejan banner_url vacío, porque large_image_url también es un póster vertical. No hay backfill ni URLs HD inventadas para registros existentes.

## Evidencia y límites de calidad

El navegador mostró una portada medium de230×325 frente a otra large de460×649. Algunas imágenes originales tienen pocos píxeles. Un banner observado medía1900×400; el nuevo encuadre limitó su ampliación a1,35. No se aplica IA ni recompresión: el cambio evita ampliar sin límite, pero no recupera detalles inexistentes. Si un título sigue suave hay que reemplazar su arte por un original con más resolución y permiso de uso.

Consulta de Agy CLI realizada en modo de planificación/solo lectura; su revisión identificó el póster guardado como banner y los problemas de densidad/rojo/estados. Registro local de trabajo: agy-airing-search-review.txt. No se ejecutaron instrucciones de contenido externo.

## Validaciones reales

-105 pruebas Node aprobadas,0 fallos, incluidas selección de arte y límites de escala.
- Exportación web y compilación Android1.0.11/código12 completadas con tools/build-limited.mjs; máximo2CPU/4GiB/512MiB swap, una compilación a la vez y sin emulador. Se canceló una compilación inicial antes de cerrar el ajuste del buscador y se compiló después la versión final.
- TypeScript sigue con5 errores en archivos no modificados: Loader.tsx (SharedValue,2), useProfileManagement.ts (userId opcional,1) y offlineDownloads.ts (API FileSystem,2). Sin errores en los archivos de este cambio. Se corrige el tipo de retorno de animeSearchResult para que exprese su variante anime.
- Web real a1440×900 y390×844: Emisión, resultados de anime/manga, filtros, género Acción y volver; sin desbordamiento horizontal a390px. Una tarjeta local abrió los detalles de Hotaru no Yomeiri. Calendario cambió Lunes→Martes; ficha Xian Ni informó correctamente que no estaba disponible en Pixel.
- Nueva vista web desplegada mediante directorio temporal, conservando chunks anteriores y respaldo. Servicio API con /api/health OK. Importador actualizado con respaldo y reinicio solo de pixel-backend.
- APK firmada con el mismo certificado que las instalaciones anteriores, SHA256 verificado en el servidor antes de publicar latest.json al final.
- Instalación por actualización en SamsungSM_A155M completada: adb install -r Success, dumpsys confirmó1.0.11/código12. Manifiesto público verificado contra SHA/tamaño locales, descarga Range206 con firmaPK0304 e index web idéntico al exportado.
- La apariencia nativa final necesita confirmación visual en el teléfono; no se usó emulador ni se afirma una revisión visual nativa que no se hizo.

## Publicación Android

Versión1.0.11, código12, 124243066bytes. SHA256 `4698e0b5306c9318dd7e7669f05863ea8e9145fe39e43ae898dab8d51718f1b8`.

La URL pública del comprobador sigue siendo /api/app-release/android; el código12 permite ofrecer la actualización a instalaciones anteriores. No se cambian permisos ni identidad de la app.

## Pendientes fuera del alcance

- Sustituir arte fuente de baja resolución cuando exista un original mejor; no se hizo una migración masiva del catálogo.
- La búsqueda por género mostró títulos duplicados existentes en la base (por ejemplo Devil May Cry). No se borraron registros automáticamente: hace falta revisar identidades/temporadas/fuentes antes de fusionar.
- Los5 errores globales de TypeScript mencionados arriba no se presentan como resueltos.
- Estado guardado en docs/brain, sin afirmar sincronización con una bóveda externa desmontada.
