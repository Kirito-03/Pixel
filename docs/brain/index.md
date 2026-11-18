# Brain Vault Index

Este directorio (`docs/brain/`) conserva las notas del proyecto en Git. El servidor `tools/obsidian-mcp/server.py` puede servirlo como bóveda local; el MCP `pixel_brain` de esta sesión está configurado para la bóveda externa Pixel en la unidad Reze.

## Regla de registro de decisiones

En estas notas se distinguen explícitamente:

- **Decisiones confirmadas**: acuerdos ya verificados, aprobados o implementados (con fecha o evidencia).
- **Decisiones pendientes**: propuestas abiertas, preguntas por resolver o cambios que requieren validación antes de aplicarse.

## Coordinación actual

- **Codex**: revisa la seguridad de backend y frontend.
- **MCP Obsidian**: confinado a su raíz de bóveda configurada (solo archivos `.md`, sin traversal, sin rutas absolutas, sin symlinks y sin ejecución de contenido). La bóveda externa requiere montar Reze; si está ausente se conserva la nota en este directorio y se registra la copia pendiente.

- [[2026-11-13-pixel-auditoria-y-drive]]: estado verificado, cambios locales, seguridad pendiente y diseño Drive.

- [[2026-11-13-detalles-trailers-termux]]: estado actual de fichas, trailers, portadas, favoritos, Android y arranque tras corte de energía.

- [[2026-11-13-cierre-diseno-git]]: diseño sin bordes, validación y estado al publicar Git.

- [[2026-11-13-buscador-universal-y-filas]]: búsqueda anime/manga y catálogo adulto separado con filas.

- [[2026-11-13-hero-categorias-busqueda]]: hero panorámico, categorías y buscador propio de la sección H.

- [[2026-11-13-mi-lista-feedback]]: foco del buscador, carga/check al guardar y favoritos H separados por perfil.

- [[2026-11-13-mi-lista-y-secciones-diarias]]: Mi Lista adaptable, cuatro filas H y destacados diarios; guardado H solo en detalle.

- [[2026-11-14-android-manga-metadatos]]: APK Android con ajustes de tráiler/pausa/Inicio, Manga rediseñado, tarjetas grandes y metadata antigua cacheada.

- [[2026-11-14-trailers-capitulos-progreso]]: sonido del tráiler, límites YouTube, regreso/siguiente capítulo y progreso por perfil en Mi Lista.

- [[2026-11-14-perfil-admin-actualizaciones]]: Perfil unificado, tema persistente, manga de Mi Lista, administración adaptable y avisos de APK 1.0.3.

- [[2026-11-15-android-inmersivo-y-compilacion]]: APK1.0.4, barras inmersivas, manga, documentos legales y límites para no saturar la laptop.

- [[2026-11-15-lector-manga-y-controles]]: APK1.0.5, navegación clara, direcciones limpias, carga anticipada/reintentos y caché de páginas en PostgreSQL.

- [[2026-11-15-noticias-android-compactas]]: APK1.0.6 con noticias más pequeñas, destacada compacta, filtros fijos y dos columnas en tablet.

- [[2026-11-15-noticias-web-y-reproductores]]: Noticias web sin marcos, nuevos feeds, importación resiliente, selector compartido y episodio real para continuar. APK1.0.7/8.

- [[2026-11-15-drive-player-saltos-y-salida]]: saltos de10segundos, encabezado de video directo, ventana Android única y prioridad de Drive frente a proveedores.

- [[2026-11-15-player-release-timeline-sync]]: causa real de la pantalla gris (VideoPlayer liberado), barra para elegir minuto y búsquedas sincronizadas por perfil autorizadas por el usuario.

- [[2026-11-15-emision-busqueda-imagenes]]: Emisión y Buscar con controles neutros, diseño adaptable, encuadre de Inicio y APK1.0.11/12; pruebas reales y límites de imágenes fuente.

- [[2026-11-15-inicio-perfiles-y-lectura]]: hero/menu transparente, tipos de lectura, descripción plegable, organización de Perfil, carga propia y selección explícita tras iniciar sesión.

- [[2026-11-15-sesion-tema-sinopsis-es]]: perfil verificado persistente, acceso obligatorio, tema claro, cargas silenciosas, encuadre de banners, sinopsis breves con traducción gratuita guardada, filtros de formatos y APK 1.0.14.

- [[2026-11-16-detalles-ruta-trailer-refresh]]: restauración del detalle por URL, tráiler Drive, relacionados y refresco por sección.
- [[2026-11-16-detalle-contraste-y-lista]]: contraste, primer/último episodio, respuestas tardías, perfil en fila y formatos de Mi Lista; APK1.0.17/código18.

- [[2026-11-16-hero-sin-saltos]]: altura estable de Inicio, sin saltos de En emisión durante cambios del carrusel.

- [[2026-11-16-filtros-paginacion-bloqueo]]: categorías desplazables, estados equivalentes, páginas reales, miniaturas con caché y candado Android; APK1.0.18/código19.

- [[2026-11-16-similares-y-red-lenta]]: identidad de portadas, ranking por afinidad y caché pública persistente con revalidación; APK1.0.19/código20.

- [[2026-11-16-android-manga-1-0-22]] — Android: navegación, botones, ancho del lector y APK.

- [[2026-11-16-lector-manga-transicion-1-0-23]] — Controles del lector Android con transición suave, menú inferior por dirección y separación de Volver.

- [[2026-11-17-respaldo-perfil-bloqueo-temporadas-1-0-24]]: respaldo manga/H por cuenta y perfil, importación de lecturas anteriores, bloqueo que se desvanece y etiquetas de temporada correctas.

- [[2026-11-17-ancho-manga-descarga-apk-1-0-25]]: páginas estrechas, descarga completa de APK verificada, Nginx específico y diagnóstico físico pendiente por red Wi-Fi.

- [[2026-11-17-depuracion-apk-importacion-1-0-26]]: APK corruptas identificadas, actualización real por Wi-Fi/IPv6, importación sin bloqueo y respaldo confirmado entre teléfono y web.

- [[2026-11-17-temporadas-leidos-cache-1-0-27]]: temporadas conservadas, capítulos leídos atenuados por perfil y caché del lector Android/web.

- [[2026-11-17-perfiles-entrada-1-0-28]]: entrada sin esperar a Admin, caché de perfiles por dueño, espera limitada y respuesta visible al tocar.

- [[2026-11-17-lector-flecha-fluidez-1-0-29]]: flecha discreta según dirección y menos trabajo de posiciones durante el scroll nativo.

- [[2026-11-18-backend-drive-y-colas]]: recuperación de backend y puente Drive, imagen rechazada por origen y propuesta de cola por etapas.
