# Detalle adaptable, acciones y formatos — 16 de noviembre de 2026

## Alcance
Continuación de [[2026-11-16-detalles-ruta-trailer-refresh]]. Esta nota sustituye su comportamiento de la tarjeta de reproducción: el detalle ahora separa empezar desde el primer episodio y acceder al último disponible en emisión. Conserva la continuación por minuto desde Mi Lista.

## Implementación
- Hero de detalle con contraste cinematográfico en ambos temas: texto blanco, sombra local y botones sólidos; cuerpo, información y episodios conservan el tema elegido. Ya no se usa texto negro sobre un póster claro sin contraste.
- Botón de tráiler centrado, cuadrado de 44 px en móvil web y objetivo mínimo de 48 px en Android. Tráiler de Drive a todo el ancho en 16:9, altura por contenido y sin tarjeta superpuesta al video.
- Play abre el primer episodio con fuente reproducible, en orden de temporada y número. Último disponible aparece solo para RELEASING y más de un episodio reproducible. FINISHED muestra Completado y no repite la tarjeta. El fin de una serie depende del estado del catálogo, no de cuántos archivos se subieron.
- Se eliminó la copia de contenido que mostraba el anime anterior; detalle, tráiler y temporadas se validan contra el ID activo. Respuestas de metadatos, streaming, relacionados y resumen de descargas se cancelan/descartan al cambiar de título o al quedar obsoletas.
- Se conserva el Modal nativo único y la liberación segura del reproductor que corrigió la pantalla gris. No se agregó un Modal de carga nativo.
- Cuenta, Preferencias y Seguridad quedan en una fila de tres columnas flexibles en móvil; navegación lateral en escritorio.
- Mi Lista propaga publication_type y tags del catálogo de lecturas. Se muestra Manga, Manhwa, Manhua, Webtoon, etc. cuando hay dato explícito; Lectura si falta. Badge neutro en lugar de azul genérico.
- Consulta SQL de solo lectura confirmó que De Vuelta A La Juventud tiene publication_type NULL y tags vacíos: no hay evidencia almacenada para clasificarlo automáticamente.
- Refresco explícito de manga, noticias y búsqueda omite la caché local correspondiente; se conserva la caché del servidor y de los proveedores.
- También incluye recuperación del detalle por URL, tráiler Drive con fallback YouTube, relacionados sin duplicados con prioridad conservadora de temporadas y selección diaria del hero de lecturas de la nota anterior.

## Validación
- 141 tests Node pasan, incluidos respuestas tardías, refresh simultáneo del mismo ID, cambio de selección y objetivos de reproducción.
- TypeScript solo mantiene los dos errores anteriores de services/offlineDownloads.ts (documentDirectory/cacheDirectory de Expo FileSystem). No se introdujeron errores nuevos.
- Exportación web y compilación Android con build-limited: dos CPU, memoria máxima 4 GiB, swap limitada, un trabajo y sin emulador paralelo.
- Revisión de Agy en modo solo lectura completada. Se corrigieron consulta tardía de descargas, doble reset/animación, Play sin fuente, fallback del estado de streaming y preservación/validación del formato previo. También se añadió supresión de reapertura durante cierre de URL y se vinculó selección al ID de ruta.
- Navegador real, sesión existente y tema claro: Yamato ID1 conserva el detalle tras recargar /home?anime=1; Último disponible apunta al episodio26. Boku6 ID914 muestra Completado sin esa tarjeta.
- Tráiler real Drive de Yamato: readyState4 y reproducción avanzando, 360×202,5 (16:9).
- Perfil comprobado a 360 y 320 px: las tres opciones comparten coordenada vertical294 y no se envuelven.
- Controles de detalle a360: Play129×42, Mi Lista131×44, tráiler44×44, alineados y sin desbordamiento.
- Captura: outputs/pixel-detalle-claro-118.jpg en el espacio de este chat.
- HTML público y todos sus scripts de entrada coinciden con la exportación final. SHA256 del HTML: 71fa34b02ac19b6a076d407ae162c880319f3aaa288a72ca93931c4bc846d87d.
- No se conectó ningún teléfono por ADB: instalación y prueba física de esta APK pendientes. La confirmación anterior del usuario sobre ausencia de pantalla gris corresponde a1.0.10, no a esta versión.

## Publicación Android
APK preparada1.0.17, código18, 123585674 bytes; SHA256 a3985566f7249fe61d7d7d00e0f99deeace1a9483bf6c2216066c11cb9beb328. Firma de continuidad verificada. Sustituye1.0.16/código17, que ya se había publicado durante la primera parte de este trabajo. El código17 no se reutilizó.
Estado final de publicación y commit: ver la actualización al pie de esta nota.

## Pendientes independientes
- Completar formatos que la fuente no entrega, con metadatos verificables o edición administrativa explícita.
- No se infiere el estado Completado al terminar la cola Drive; debe actualizarlo la sincronización de catálogo.
- Telemetría por archivo, ETA real del bot Drive y depuración de la cola AV1 heredada siguen en la nota de observabilidad; no se consideran resueltos aquí.
- No se modificó ni reinició backend, túnel ni trabajadores de ingesta.


## Resultado final
Publicada la web y la APK1.0.17/código18. Manifiesto público coincide en versión, código, tamaño y SHA256 con el paquete firmado; descarga parcial206 y cabecera ZIP PK0304 verificadas. Instalación física pendiente por ausencia de teléfono conectado.
