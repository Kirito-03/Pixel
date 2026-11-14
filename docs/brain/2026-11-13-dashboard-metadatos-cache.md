# Dashboard, tráileres, español y caché — 13 noviembre 2026

Revisión del código y esquema con agy-cli; no se ha rediseñado ni publicado un panel nuevo. Datos actuales consultados en PostgreSQL de la tablet:65 animes,24 mangas,0 capítulos de manga cacheados y34 noticias. Estas cantidades son registros, no prueba de archivos reproducibles.

## Diagnóstico comprobado

- Hay un admin Expo/React en screens/admin y otro HTML antiguo en server/admin. El HTML enlaza a tres páginas inexistentes; el panel React tiene módulos y formularios reales, pero navegación de episodios/nuevoanime parcialmente deshabilitada y sin administración completa de manga/noticias/calendario. Mantener Expo/React como panel principal y retirar enlaces al HTML antiguo al unificar login/rutas.
- Estadísticas usan registros y storage_type de anime_episodes, no la cola SQLite ni verificación real de Drive. El panel incluso etiquetaStorage(R2) aunque hay archivos privados en Drive. Separar metadatos detectados, descargados, verificados y publicados.
- Anime del catálogo se lee de anime_content en PostgreSQL. Trailers: las interfaces pueden reproducir YouTube, pero el esquema anime_content consultado no tiene campos de trailer; el servicio AniList de backend tampoco los solicita. El modal del catálogo construye un objeto sintrailer. No alcanza con añadir un botón.
- Importación de sinopsis AniList/Jikan no garantiza español. Hay traducción de cliente, Map en memoria y proxyLibreTranslate/DeepL sin persistencia de traducciones. En la tablet TRANSLATE_PROVIDER usa el fallbacklibre y no hay DEEPL_API_KEY configurada; no se probó un proveedor de traducción funcional en esta revisión.
- Noticias: news_articles y scheduler6h; las consultas públicas leen la base. Volver a pedir al backend no significa volver a llamar a NewsAPI. Pantalla solicita featured/list/trending en cada montaje/cambio de categoría.
- Manga: manga_cache, manga_chapters_cache y páginas cacheadas; detalle12h, lista6h, popularscheduler12h. La lista exige cached.items.length>=limit y evita cache para búsquedas: una lista corta/últimapágina o búsqueda puede repetir scraping. La versión local de server/index.js incluíaDELETE de capítulos en cada arranque; se eliminó localmente para que no vuelva en despliegues. La copia activa de la tablet NO contenía esa línea al comprobarla, así que no se afirma que estuviera borrando la caché en ejecución.
- Emisión: secciónlocal usa catálogoSQL; calendarioJikan usaMap en memoria2h, perdido al reiniciar. Además solo consulta25 resultados por día y requiere revisar paginación y zona horaria al persistirlo.
- TMDB: axios-cache-interceptor15min en cliente; se pierde con el proceso. AniList/LibreTranslate nativos pueden salir directamente desde el cliente, evitando la caché central. El modal solicita dos veces el detalle del mismo anime en su secuencia.

## Correcciones hechas ahora

1. Se retiró el borrado de manga_chapters_cache del index local. La copia remota ya no tenía ese borrado.
2. Redis en Termux respondíaPONG, pero el backend tenía REDIS_HOST sin configurar y usaba el nombreDockerredis. Se configuró127.0.0.1 en el archivo privado de la tablet, se comprobó escritura/lectura/borrado de una clave temporal y se reinició pixel-backend para aplicarlo. No se cambiaron permisos/exposición de Redis ni se imprimieron credenciales.

## Plan propuesto de implementación

1. PostgreSQL como fuente persistente y APIs externas como procesos de enriquecimiento/actualización. Cachear por proveedor+tipo+ID+idioma+filtros+página; guardar fetched_at/expires_at/status y hash del origen; deduplicar solicitudes concurrentes. Mostrar datos disponibles y actualizar vencidos en segundo plano, con reintento y último dato válido al fallar. Cachear ausencia de trailer y resultados vacíos válidos; no guardar fallos como datos correctos. El cliente conserva una caché persistente breve y revalida, sin descargar lo mismo al montar cada pantalla. Nunca mezclar datos privados entre usuarios.
2. Metadatosanime: IDsAniList/MAL, trailer_site/trailer_id/trailer_checked_at/source, description_original/description_es/source/hash/translation_status/translated_at y marca de ediciónmanual. Obtener un trailer del registro identificado; soloYouTube permitido en el primer paso; validación del ID y ediciónmanual. Si no hay trailer, ocultar botón y recordar la comprobación. Texto español preferente en fuentes autorizadas; si falta, traducir una vez en backend con proveedor validado; conservar original y no sobreescribir cambiosmanuales. Conectar importador, API, tipos, modal y editor en conjunto.
3. Cachepersistente de emisión por día y zona, paginacióncompleta y relación con catálogo; corregir listas y búsquedas de manga e invalidación de noticias al editar. Mostrar última actualización/fuente y no perseguir cuota cero sacrificando frescura.
4. Adminunificado en React: módulos Anime, Manga, Noticias, Emisión, Trabajos/AV1-Drive y APIs/cache. Tablero con conteos reales por estado, fallos/reintentos, última sincronización, edad de caché y acciones de actualizar solo un registro. Noticias con revisión/publicación y manga con capítulos/idioma/lectura; calendario con datoslocales versus calendarioexterno.
5. Piloto: un anime con trailer y español, un manga y capítulos, noticias y un día de emisión. Abrir/cerrar/recargar y reiniciar backend; demostrar con contadores que las respuestas existentes se leen sin repetir solicitudes externas dentro de la vigencia y que una actualizaciónmanual invalida únicamente su clave.

Este documento es diagnóstico y plan, no declara implementados los nuevos campos, traducciónpersistente, calendarioSQL ni módulos del admin. Mantener la decisión del usuario: AV1 original; no generar variantesH264 en nuevas ingestas cuando se actualice el flujo.
