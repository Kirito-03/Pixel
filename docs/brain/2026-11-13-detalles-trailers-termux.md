# Pixel: detalles, trailers y recuperación Termux — 13 noviembre 2026

## Estado comprobado

- Se trabaja junto a agy-cli: auditoría de componentes activos, metadatos de trailer, servicio de favoritos, navegación del lector y compilación Android.
- La ficha activa es components/AnimeSeriesModal.tsx. La web ocupa toda la ventana; el fondo del hero usa el ancho completo y el contenido inferior está centrado con máximo1120px. Texto y acciones tienen ancho acotado. Capítulos en dos columnas escritorio y una móvil.
- Anime similar usa MovieRow/MovieCard de Inicio: flechas, tarjeta ampliada mediante portal sin recorte, acciones y trailer tras al menos5segundos de hover. La navegación desde su botón de detalles fue comprobada. Al cambiar de título se vuelve arriba y se limpian datos anteriores.
- TrailerYouTube silenciado con controls=0 y fs=0. Los elementos de marca/título/avisos que decida YouTube pueden permanecer: modestbranding ya no tiene efecto. Botón propio de detener fuera del iframe. Fuente: https://developers.google.com/youtube/player_parameters .
- Android tiene programado iniciar trailer a los3segundos al abrir ficha, detener al salir de primer plano, desplazarse o reproducir un capítulo. No se declara validado en ejecución nativa todavía.
- PostgreSQL contiene migraciones001–006;006_anime_trailers aplicada. AniList/Jikan guardan trailer_id/site/checked_at; backfill verificado30registros,29trailers y1ausencia. No consulta búsqueda externa cada vez que se abre una ficha con estos datos.
- Auditoría SQL no encontró títulos exactamente duplicados al normalizar mayúsculas/espacios. Había solapamiento entre filas Home; se excluyen destacados de estados y se deduplican filas y nuevos bloques de géneros. Esto no prueba ausencia de aliases o temporadas diferentes.
- Portadas de manga corregidas en producción: el proxy estaba siguiendo una redirección y devolviendo HTML de verificación como imagen. Usa identificación honesta PixelNoSekai, sin redirecciones, límite5MiB, host/rutaHTTPS exactos, MIME y firmasJPEG/PNG/WebP, nosniff y no-store ante fallo. Respuesta realHTTP200image/jpeg y portada visible comprobadas. URLs absolutas también sirven a Image nativo; v=2 evita el HTML previamente cacheado.
- Manga: ancho1000px, accionesmax520px, descripción720px, capítulos2columnasescritorio/1móvil. Selector muestra idioma entregado y avisa al usar inglés. Lector ya no serializa objetos de capítulos en la URL; obtiene la lista por manga/idioma y conserva chapterId al navegar. Callback de visibilidad estable evita crash de FlatList. Se separó barra del lector del Header absoluto que tapaba los botones.

## Servicios y corte de energía

- Tablet arle: Pixelbackend y mediaworker en PM2; PostgreSQL y Redis activos; health y health/db HTTP200. No es un VPS adicional.
- Se añadió tools/termux/start-pixel.sh y se instaló ~/.termux/boot/start-pixel.sh: inicia cluster existente ~/server/data/pixel-postgres, Redislocal y restaura PM2guardado si falta Pixel. pm2save ejecutado. bash-n y ejecución idempotente con servicios activos: correctos.
- Script antiguo start-server.sh respaldado antes de cambiar Redis de bind0.0.0.0/protected-modeno a127.0.0.1/protected-modeyes. No se ejecutó el script completo ni se modificaron los otros servicios.
- Falta prueba de reinicio real: Android debe permitir Termux:Boot y ejecución en segundo plano. No reiniciar la tablet automáticamente para demostrarlo.

## Límites y pendientes reales

- MiLista reparada en producción: la ruta real era `profiles/{uid}/profiles/{profileId}/mylist` sin guion bajo. Se retiró el fallback al mapa del perfil. Reglas de Firebase publicadas permiten crear/actualizar favoritos validados del dueño del perfil existente, incluyendo IDsstring de manga; lectura/eliminación siguen limitadas al propietario. Se conservó el resto de reglas. Prueba real de manga: añadir, recargar (persistencia) y quitar, correctas. Consulta sin sesión:403. Se preservó el campo legado my_list creado durante las primeras pruebas; no se utiliza ni se borró. Eliminación compatible con IDsaleatorios de clientes antiguos, sin tocar otros títulos/perfiles. Reglas respaldadas antes del cambio; versión actual en firestore.rules.
- Los botones de anime abren el reproductor. VOE falló con error multimedia; MP4Upload cargó reproductor con duración, sin garantía de disponibilidad de todos los capítulos.
- Las páginas internas del manga probado devuelven403 desde mangadex.network. Portadas corregidas no equivalen a lectura completa reparada. No eludir restricciones del proveedor.
- AndroidStudio instalado por Flatpak, AVDMedium_Phone_API_37.0 arrancado y visible enADB. JBR25 incompatible con Gradle8.14.3; se preparó Temurin21 en el directorio de trabajo. Se encontraron paquetes nativos incompletos y se están restaurando sus versiones exactas, con agy. Ver docs/android-emulator.md cuando finalice.
- Repo local y servidor difieren en mangaService.js: local tiene cambios de scraping y producción usa MangaDex. NO copiar el servicio local completo al servidor sin reconciliación; se preservó el servicio funcional de producción.
- Continúan pendientes: AV1original como única política de nuevas ingestas (no afirmar cambiado el worker), entrega pública segura de Drive, OAuthrclone propio antes de lotes, traducción española persistente, cachéSQL de emisión y módulos del dashboard. No eliminar derivados existentes sin decisión explícita.
- El originalAV1 del piloto tiene125635937bytes y el derivadoH264342354947bytes, ambos ya archivados en Driveprivado; esa diferencia motivó elegir AV1original. No confundir archivado privado con streamingpúblico.

## Validación

- Exportación web realizada y desplegada porSSH con copia previa de dist.
-29pruebas: trailers, MiLista con Firestore simulado y rutas de seguridad/proxy. Todas pasan; además se comprobó el ciclo completo de favoritos con Firebase real.
- TypeScript global conserva errores previos en otros componentes; no afirmar compilación de tipos global limpia.
- Capturas de evidencia en outputs del chat: pixel-anime-pantalla-completa.jpg, pixel-manga-portada-corregida.jpg y pixel-similares-hover.jpg.

## Fondos de anime y sección activable de adultos

- Causa real de varios fondos borrosos: catálogo sinbanner y portada vertical usada como fondo panorámico. También hay registros con imágenesmedium. El nuevo AnimeArtwork calcula proporción y dimensiones, presenta la portada completa a la derecha en escritorio cuando es vertical, limita ampliación (1.5xportada/1.35xbanner), conserva la parte superior en móvil y acepta puntofocal explícito. No puede reconstruir detalle inexistente en el origen; el importador ya prioriza extraLarge y debe enriquecerse el catálogo existente con fuentes correctas antes de prometer HD universal.
- Se retiró scale1.05 y objectPosition aplicado a ImageRNWeb (no resolvía el background real). Nuevo cálculo compartido web/nativo con cuatro pruebas de geometría.
- Sección activada poradultContentEnabled: max1120 y columnasresponsive, ficha a pantalla completa con contenido acotado, tarjetas sin etiqueta falsa Finalizado y botones accesibles. Ya no se consulta el catálogo si está apagada; cambio de perfil/desactivación cierra ficha/reproductor e invalida respuestas pendientes. FallosAPI se propagan al estado de error, no se disfrazan de catálogo vacío.
- Activar la preferencia temporalmente para QA queda a la espera de respuesta del usuario; no dar ejecución real de esa sección por comprobada solo por revisión de código. El interruptor es una preferencia de visibilidad del cliente, no un control de autorización del backend. Revisar persistencia porperfil: el campo remoto anterior es global porusuario.
