# Similares sin duplicados y carga con red lenta — 16 de noviembre de 2026

## Diagnóstico
La imagen enviada corresponde a Bastard. En PostgreSQL aparecen dos fichas con nombres distintos: ID920 BASTARD!!: Ankoku no Hakaishin e ID935 Bastard!! Ankoku no Hakaishin Part2(ONA). Ambas tienen la misma portada AniList bx404 y la misma fecha1992-08-25, además de títulos alternativos iguales. El filtro anterior omitía aliases de nombres con Part/Season para conservar temporadas y por eso no detectaba esta duplicación.
Además, el pool de similares siempre era la primera página de40títulos recientes de un género. Eso hacía que se repitieran las mismas recomendaciones al abrir distintos animes.

## Implementado
- Identidad AniList extraída de la portada en hosts oficiales sN.anilist.co. Ignora tamaño de portada/CDN y query de caché. Se deduplican IDs internos, aliases y misma identidad de portada/fecha, incluido el propio anime.
- Se conservan temporadas con identidades distintas y casos con portada reutilizada pero fechas de estreno distintas. No se borraron fichas, episodios, historial ni progreso de la base.
- Nuevo endpoint de recomendaciones sobre el catálogo activo completo: afinidad entre géneros, proximidad de estreno y rating; devuelve hasta40candidatos y el cliente selecciona hasta15sin duplicados. Se conserva la prioridad de temporadas del grupo actual.
- Géneros son text[] en esta tabla: consulta mediante unnest/cardinality. La primera prueba real detectó una conversión incorrecta a jsonb; se corrigió y se verificó contra PostgreSQL y el endpoint público antes de publicar el frontend.
- Se usa la traducción española almacenada por hash del original y se limita la sinopsis de recomendaciones a240caracteres antes de enviar JSON. La lectura no llama a proveedores de traducción; la cola existente mantiene su presupuesto.
- Caché pública del cliente para Inicio, fichas, episodios y recomendaciones. Comparte peticiones simultáneas de la misma ficha: detalles, streaming y relacionados ya no vuelven a pedir la misma metadata tres veces.
- Memoria limitada a40entradas; persistencia de hasta4MiB UTF8 y1MiB por entrada. Solo catálogo público, sin perfiles, Mi Lista, progreso, credenciales ni búsquedas. Las consultas con search no se guardan en esta caché.
- Ventana fresca5min para catálogo/fichas y1min para episodios. Lo guardado puede mostrarse hasta24h mientras se revalida en segundo plano. Al llegar nuevos datos, los consumidores activos actualizan la pantalla. Errores de red o cuota de almacenamiento no invalidan datos aún utilizables.
- Refresco manual omite la lectura guardada y espera red; puede compartir una petición de red ya en curso. Actualiza también similares. Inicio mantiene el contenido visible durante el refresco y cancela cambios tras desmontarse.
- Web: carátulas con loading=lazy y decoding=async, conservando dimensiones y URL/calidad. Hover usa su vista previa habitual.
- Android: filas con render inicial ajustado a pantalla, lotes de4 y ventana de5pantallas en FlatList. No se cargan todas las tarjetas de una fila desde el comienzo.
- Cancelación de similares al cerrar/cambiar de ficha y guardas de suscripción para no actualizar un anime anterior.

## Verificación
-159 tests Node pasan y11 de seguridad de rutas pasan. Incluyen el caso real de Bastard, temporadas legítimas, caché persistente tras reabrir, revalidación lenta/offline, límites, consultas transitorias, notificación/desuscripción y conservación de Inicio durante refresco.
- TypeScript conserva exclusivamente los dos errores previos de Expo FileSystem en services/offlineDownloads.ts.
- Revisión Agy solo lectura: se incorporaron las correcciones de refresco de similares, suscripción SWR, cancelación, búsqueda transitoria, carga de Inicio y conservación de temporadas. Compartir red ya en vuelo con force es una decisión deliberada para evitar duplicación, no una nueva descarga por cada consumidor.
- API real: para IDs1 y914 devuelve40candidatos con primeros IDs distintos; ninguna de las dos listas incluye las fichas Bastard. Sinopsis máxima240caracteres.
- Navegador real, YamatoID1:15portadas de Similares y15identidades AniList distintas; las15 usan carga diferida. La recarga conserva la misma ficha y la sección Similares.
- Captura: outputs/pixel-similares-sin-duplicados.jpg en el espacio de este chat.
- HTML público SHA25661feb561294cd63df094a8768ba05afaab55aadd5246f24ee5a4df0873da6016, coincide con exportación local.
- Compilaciones web/APK limitadas y secuenciales; sin emulador paralelo. Backend con copia previa y validación real. No se cambió el túnel ni la cola de ingesta.

## Límites
No se promete navegación instantánea ni reproducción offline. La primera descarga de datos/imágenes, el inicio de sesión y el video siguen dependiendo de la conexión. No se comprimieron ni redujeron las imágenes. La prueba física de esta APK queda pendiente; no se instaló en un teléfono.

## Android
APK1.0.19/código20,123599350bytes; SHA256555bc8fe9d6d325f639cc48e3a636258f5eaf0030bf20dd5b5638f673cc362d8. Firma de continuidad comprobada; incluye mejoras anteriores. Estado final de publicación y Git al pie.


## Publicación final
Web y APK1.0.19/código20 publicadas. Manifiesto público comparado con el paquete firmado: versión, código, tamaño y SHA256 coinciden; descarga parcial206 con cabecera ZIP PK0304 verificada. No se hizo instalación física en teléfono.
