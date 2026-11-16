# Filtros, páginas y bloqueo del reproductor — 16 de noviembre de 2026

## Solicitud
Ventana de categorías desplazable en Android para H, filtros de lecturas que no quedaran vacíos, resultados en cuadrícula y paginación cuando pasan de50, miniaturas más rápidas y bloqueo contra toques accidentales durante anime/H.

## Implementado
- H usa un diálogo con altura acotada, ScrollView independiente, cierre, limpieza de selección y Ver resultados. La selección se mantiene como borrador: X/Atrás cancela; Ver resultados aplica.
- La vista inicial conserva cuatro filas; Ver catálogo completo abre todos los resultados, igual que buscar o filtrar. Se presenta una cuadrícula adaptable y páginas reales de hasta50 elementos, con Anterior/Siguiente e indicador.
- El API conserva la respuesta antigua en array si no se solicita page. Las solicitudes paginadas devuelven items, total, totalPages y las categorías de todo el catálogo. Se filtra antes de LIMIT/OFFSET en PostgreSQL, con consultas parametrizadas y orden estable updated_at/id.
- Se cancelan respuestas atrasadas al cambiar página, perfil o filtros. El cambio de estado ya no duplica la consulta inicial y la de resultados.
- Lecturas: En emisión se corresponde con ongoing/releasing/airing; Finalizado con completed/finished y sus equivalentes. La base tenía1150ongoing y5completed en la consulta diagnóstica, por eso la comparación literal española devolvía cero. No se reescribieron los estados de los registros.
- Lecturas también usa páginas de50, sin acumular indefinidamente las tarjetas. El orden añade manga_id como desempate.
- Miniaturas de episodios Drive: nuevo endpoint de imágenes numérico, comprueba la miniatura registrada y el episodio activo y descarga solamente del puente local127.0.0.1:8086. No admite URLs arbitrarias. Caché LRU en RAM limitada a16MiB/24h, por imagen máximo512KiB y validación JPEG, solicitudes simultáneas deduplicadas, errores no almacenados y caché HTTP de24h.
- Cliente usa esa URL para las miniaturas Drive y precarga hasta8 con dos solicitudes simultáneas. Se conserva el marcador en capítulos sin miniatura; no se inventan imágenes ni se transcodifica video.
- Android anime directo y reproductores integrados de anime/H: candado para ocultar título/controles y bloquear toques sobre el video. Mantener pulsado700ms el botón desbloquea. Tiene acción accesible de desbloqueo. El estado se reinicia al cambiar de episodio; conserva el progreso y la ventana nativa única.

## Validación
-147 tests cliente/servicios pasan y11 tests de seguridad de rutas pasan.
- Nuevas pruebas: SQL de estados, límites/páginas y orden, parámetros de búsqueda/categoría, deduplicación/LRU/errores de miniaturas, toques y eventos de reproducción mientras está bloqueado y desbloqueo.
- TypeScript conserva exclusivamente dos errores previos de Expo FileSystem en services/offlineDownloads.ts; no se agregaron errores.
- Agy revisó en solo lectura y se corrigieron sus observaciones sobre acceso al catálogo sin filtros, doble petición por estado y selección aplicada al cerrar el diálogo.
- Datos reales del API: En emisión devuelve50 de1149lecturas activas. H devuelve1022títulos,21páginas y40categorías. Páginas1/2 sin IDs repetidos.
- Navegador real a360×800: cierre de categorías no aplica Romance; diálogo con660px de alto, pie de acciones dentro de pantalla y lista desplazable. Cuadrícula con dos columnas de158px (x16/x186), sin ancho de documento mayor a360. Avance real a2/21.
- Detalle de Yamato ID1: siete imágenes DOM de /api/episode-thumbnails/1/1…7 completas y cargadas.
- Miniatura24.003bytes: primera consulta pública3,80s; repetición1,39s (incluye red). Ambas con mismoSHA256 y HTTP200 image/jpeg; max-age86400. No se garantiza una demora fija cuando Drive/red están lentos.
- Captura de la ventana móvil: outputs/pixel-categorias-movil-119.jpg en este chat.
- Publicación web HTML SHA25622d1a59e96cbb50662a45192571ecfac1c4be65a5bd7bee65e1dcd4f500b7bff, coincide con exportación local.
- Backend desplegado con copia previa y reinicio de pixel-backend; no se reinició pixel-media-worker ni se modificó Nginx/túnel/credenciales. Los tres archivos existentes coincidían con HEAD antes de reemplazarlos.
- Exportación web y APK mediante build-limited, en secuencia y sin emulador. ADB sin dispositivos: prueba física del gesto y del desplazamiento nativo pendiente.

## Android
APK1.0.18/código19,123591510bytes; SHA25636586eabff819f8315757afd58139da3792ae5d7ce273b9b5cd53cb7a52b17fc. Firma de continuidad verificada. Incluye también la corrección anterior de altura del hero de Inicio. Estado final de publicación y Git al pie.


## Publicación final
Web y APK1.0.18/código19 publicadas. Manifiesto público verificado contra versión, código, tamaño y SHA256 del paquete firmado. Descarga parcial206 con cabecera ZIP PK0304. No se instaló en un teléfono: no había dispositivos ADB conectados. La pestaña de QA fue cerrada durante la comprobación opcional de páginas de lecturas; no se atribuye una prueba visual de la página2 de Manga. Sí se verificaron el filtro de estado y la página2 de H, además del API/SQL.
