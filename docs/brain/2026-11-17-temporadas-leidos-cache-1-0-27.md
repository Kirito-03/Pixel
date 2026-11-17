# Temporadas, capítulos leídos y caché — 1.0.27 (29)

Fecha: 2026-11-17.

## Temporadas: estado existente

La corrección de 1.0.24 sigue activa: animeSeasonLabel detecta temporadas explícitas en el título cuando el catálogo guarda un solo grupo local 1. Ejemplo comprobado anteriormente: Black Clover 2nd Season muestra Temporada 2, conservando sus IDs, numeración interna, progreso y estado En emisión. Partes/cours ambiguos no se convierten automáticamente en temporadas. El estado de emisión se resuelve por separado.

## Capítulos leídos por perfil

- Cada capítulo cuya imagen llega a mostrarse se incorpora al historial del perfil. Pulsar una fila o recibir solamente URLs no marca una lectura fallida.
- Las filas leídas se atenúan al 60%, incluyen check y texto Leído; la lectura más reciente indica Continuar. Se mantiene la navegación y el diseño adaptable de una/dos columnas.
- readChapters se guarda junto al último capítulo en la cola local cualificada por cuenta/perfil y se sincroniza mediante transacción Firestore. Las marcas de dos dispositivos se unen; el puntero Continuar sigue la fecha/revisión más reciente. Una respuesta remota que omite marcas pendientes no confirma la cola.
- La información antigua solo permite recuperar el último capítulo registrado. No se inventa que todos los anteriores hayan sido leídos. La importación antigua añade esa marca sin reemplazar un avance más nuevo.
- Los números enteros consecutivos se compactan en intervalos, los decimales se normalizan y los identificadores no numéricos usan una huella estable. Límite: 256 fragmentos por título; miles de capítulos consecutivos caben en un solo intervalo. Si una unión supera ese límite, falla conservando los datos anteriores y la cola pendiente, sin recorte silencioso. Sigue existiendo el límite global de 1 MiB del documento Firestore de cuenta; una biblioteca mucho mayor necesitará migración a documentos separados.
- El puente nativo avisa una sola vez al cargar imágenes; descarta mensajes fuera del rango de páginas. La marca mostrada queda ligada al capítulo/perfil, evitando usar una confirmación visual anterior al cambiar de perfil.

## Caché del lector

- Metadatos públicos separados del historial privado: espacio pixel:manga-reader:v1, 30 entradas, 3 MiB persistentes, caducidad de 6 horas.
- Listas de capítulos: 2 minutos frescos; después se entrega lo guardado y se revalida en segundo plano hasta caducar. Deslizar para actualizar fuerza consulta de red y transmite refresh=true para renovar también el catálogo del servidor; se comparte una petición que ya esté en vuelo para evitar duplicados.
- Listas de páginas no vacías: reutilización durante 6 horas. Nunca se guardan vacíos/errores como un éxito. Reintentar ahora permite saltar esta caché.
- Cancelar una pantalla solo desconecta su espera, no cancela la petición que usa otro consumidor. Las URL y bytes de las imágenes originales no se reducen ni recomprimen.
- Android WebView usa caché HTTP habilitada/LOAD_DEFAULT. El proxy de imágenes ya entregaba Cache-Control público de 7 días; se mantienen URLs estables, carga anticipada cercana y reintentos existentes. No es una descarga completa offline ni acelera una primera petición a un origen lento.

## Validación

- 210 pruebas Node aprobadas: unión offline entre dispositivos, ACK incompleto, perfiles aislados, conservación ante exceso de fragmentos, importación antigua, decimales, caché tras reabrir, vacíos, refresh, cancelación compartida y aviso tras carga real de imagen.
- TypeScript no añade errores nuevos. Persisten los dos errores previos de documentDirectory/cacheDirectory en services/offlineDownloads.ts:83.
- Revisión adicional con agy en modo solo lectura; se aplicaron correcciones de conservación ante límite, normalización decimal, espera de aceptación remota, claves canónicas de caché y reintento por capítulo.
- Web exportada con el wrapper limitado: 44 archivos verificados antes de publicar assets y luego index.html de forma atómica. HTML público coincide con SHA256 7f0bf60c989a238c576b34f5ebaf801e8833766a037be5c86398b92cfdd62960.
- Web real: se comprobó una fila del historial existente con etiqueta leído/continuar y opacity 0.6, sin abrir capítulos ni modificar el progreso.
- Web adaptable a 390 px: fila leída de 350 px, opacity 0.6 y sin desbordamiento horizontal. Se restauró el viewport del navegador.
- APK compilada con npm run build:android/JDK21 y límites de recursos; BUILD SUCCESSFUL en 2m42s. Paquete, firma fijada y zipalign 16 KiB aprobados.
- APK pixel-1.0.27-28.apk: 123639794 bytes, SHA256 8d85ce1144ee92619dfd01916ffcae9ce1e458601c73113778759d0894c7a131.
- Instalada con adb install -r --no-incremental en el Samsung del usuario: Success, versión1.0.27/código28, mismo appId10414 y fecha original de instalación. No se desinstaló ni borró información. Revisión de interfaz física pendiente mientras el teléfono está bloqueado; se pidió desbloqueo.
- La compilación28 fue una intermedia instalada y validada con descarga completa HTTP200/SHA256 correcto. Se detectó y corrigió antes del cierre el reenvío de refresh=true al servidor; la segunda compilación usó código29, conservando el mismo nombre comercial1.0.27 y un archivo de APK diferente.
- Interfaz física: el usuario desbloqueó el teléfono, pero Pixel estaba en una operación de inicio de sesión Google pendiente. Se pidió terminar la sesión y elegir perfil para comprobar las marcas sin alterar lecturas.
- Código29 se instaló correctamente con la misma identidad y datos. Antes de publicarlo, el usuario reportó un problema adicional en la selección de perfiles; se incorporó a la publicación final1.0.28/código30. Ver [[2026-11-17-perfiles-entrada-1-0-28]]. La web1.0.27 sí se publicó y verificó.

## Obsidian

El MCP está disponible, pero devuelve Vault root directory does not exist: Reze no está montada. Esta nota y la nota 1.0.26 quedan guardadas en el proyecto y pendientes de copiar a la bóveda externa cuando vuelva a estar accesible.
