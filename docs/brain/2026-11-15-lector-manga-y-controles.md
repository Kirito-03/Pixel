# Manga: lector, enlaces y controles de video — 15 de noviembre de 2026

## Publicado

- Web y backend desplegados en pixelnosekai.com. Bundle `index-9284473b746b6b2eb870f77a0442e3e9.js`. Respaldos de dist/backend y manifiesto anterior en ~/server/backups de la tablet. Datos/credenciales existentes conservados.
- APK1.0.5, versionCode6, 124233530bytes. SHA256 `dcd2178359bc3aab554762a30127eae2068e91d8e2c8fbe7d507feb67f12cac9`. Firma comprobada contra la huella de continuidad. Manifiesto publicado después del binario completo y checksum remoto validado.
- https://pixelnosekai.com/api/app-release/android anuncia1.0.5/6. https://pixelnosekai.com/api/app-release/android/download?build=6 respondeHTTP206 en descarga por rango y MIME APK correcto.

## Cambios

- Reproductor de video: título/episodio arriba con degradado, botónVolver separado; anterior/siguiente abajo a la izquierda y selector explícito Servidor abajo a la derecha. Ambos desaparecen con los controles; el menú se abre sobre la barra inferior. Se eliminó la pastilla de servidor que quedaba siempre visible. No se modifican los controles internos del proveedor.
- Quitados ES/EN de la ficha manga. Prioridad español y fallback existente conservados internamente.
- El lector tiene Anterior y Siguiente capítulo con texto/número al principio y al final. Extremos sin capítulo quedan deshabilitados. En web, la carga progresiva ofrece también Cargar más páginas, sin spinner de pie infinito.
- Web usa img de altura natural en ScrollView, sin depender de Image.getSize ni de recorte/virtualización de páginas largas; precarga próxima con IntersectionObserver a1600px. Android usa Android WebView con HTML propio para conservar imágenes originales/tiras largas y evitar el reescalado anterior de Fresco; incluye zoom, precarga próxima, reintentos y navegación al principio/final mediante bridge restringido a mensajes de página/anterior/siguiente.
- Reintentos de manifiesto/página vacíos y errores temporales con esperas3,6,12,24,30s y tope30s, hasta éxito mientras el lector esté activo. Abortan al cambiar de capítulo/salir; se pausan en segundo plano. Errores permanentes400/401/403/404/410 no se martillean. Hay reintento manual, pausas en la carga del capítulo y estados por imagen; no pantalla vacía silenciosa.
- Se desactivó caché Axios para capítulos/manifiestos. Antes una respuesta200con pages[] podía quedar guardada5min e impedir recuperación real. Backend ahora devuelve503/no-store para páginas vacías y400 para origen inválido.
- Nuevos enlaces públicos /manga/<id>/cap-<n>; extras usan una clave estable. No exponen el URL del proveedor en barra/query. Los enlaces largos anteriores se aceptan y convierten cuando se resuelve el capítulo. Solo id+chapterKey al navegar; título/contexto se resuelve por metadatos, conservando contexto local cuando se abre desde ficha. Datos tardíos de otro manga/capítulo se descartan.
- Migración008_manga_page_cache: JSONB de URLs de páginas por capítulo y fecha, TTL6h. Caché en memoria acotada60capítulos y deduplicación de solicitudes simultáneas. Solo se persisten respuestas con páginas. El cache dura reinicios; no almacena binarios de imágenes en PostgreSQL.
- Selector del scraper elige data-original y la mayor variante srcset en páginas/portadas, antes que thumbnails o placeholders. Las portadas ya cacheadas se actualizarán cuando se renueve su metadata.
- El proxy conserva bytes originales y ahora rechaza HTML/formatos no válidos en vez de cachearlos7días como si fueran imágenes. Se mantiene la restricción al host conocido.
- Portadas: carga principal separada del fallo del fondo. Ya no desaparece la portada porque falle el backdrop. Reintentos de portada e idempotencia al normalizar URLs proxy (sin doble proxy).

## Evidencia

- Caso del usuario hbit…/capitulo-2: API entregó20páginas. Primera consulta2,17s desde origen y posterior1,29s de extremo a extremo con cache_hit=true/memory (no promesa de latencia constante). Después de reiniciar el backend, capítulo3 devolvió19páginas con source=db/cache_hit=true, confirmando persistencia real.
- Web real: /manga/hbitoqldxrw11ot/cap-2 abre capítulo2/20páginas; Siguiente navega a cap-3 y Anterior vuelve a cap-2. Enlace antiguo con doble codificación se convierte a la dirección limpia. Ancho390: document.scrollWidth390, botones dentro del viewport.
- La portada mersepoditaakt1 devolvió un PNG256×256 de2495bytes desde el proxy; conservar originales/reintentar no reconstruye detalle ausente en ese archivo. No se afirma sustitución por una portada de mayor resolución.
- 77testsNode pasan, incluyendo caché persistente/deduplicación/no caché vacía, selección de original, cancelación/backoff, enlaces nuevos/anteriores y ejecución del script del lector con fallos/cambio de actividad.
- Build release final BUILD SUCCESSFUL en1m51s; exportweb correcto. Se usaron comandos build-limited y no se ejecutó el emulador durante la compilación. TypeScript sigue con los errores previos de Loader, useProfileManagement, AiringScreen y offlineDownloads, sin errores nuevos en archivos modificados.
- Prueba Android WebView API37 con imagen SVG720×12000: PASS, dimensiones originales, tira larga y dos barras de navegación. No prueba gráfica completa del lector con contenido real en teléfono físico.

## Pendientes/límites

- Comprobar en el Samsung tras instalar1.0.5: nitidez del capítulo señalado por el usuario, scroll rápido, reintentos con mala conexión y controles flotantes del video. La calidad final depende de la resolución real de cada archivo del proveedor.
- El emulador generó presión de swap; se cerró. Próximas pruebas deben limitar swap o usar teléfono, sin aumentar recursos. Ver docs/android-emulator.md.
- Notas locales en docs/brain; la bóveda externa de Obsidian no estaba montada en la última comprobación.
