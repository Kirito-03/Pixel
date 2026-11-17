# Publicar una APK y activar el aviso de nueva versión

La APK 1.0.3 (código 4) incluye el comprobador. Las instalaciones anteriores necesitan instalarla una vez. Después, una compilación publicada con código superior se ofrece al abrir la app o al volver a ella tras seis horas. El usuario confirma la descarga y la instalación de Android; también puede buscar manualmente en Perfil → Preferencias.

1. Cambia `expo.version` y aumenta `expo.android.versionCode` en `app.json`. El código siempre debe crecer.
2. Con Android SDK y JDK configurados, sincroniza los archivos nativos y compila:

   ```bash
   node tools/android-release.mjs prepare
   # JAVA_HOME debe apuntar a JDK 21; ANDROID_HOME al SDK local.
   npm run build:android
   ```

3. Prepara el paquete. Este comando comprueba identidad, versión y certificado contra las instalaciones anteriores; genera la APK y `latest.json` en una carpeta fuera de Git:

   ```bash
   node tools/android-release.mjs package android/app/build/outputs/apk/release/app-release.apk /tmp/pixel-android-release
   ```

   Para personalizar las notas, define `PIXEL_RELEASE_NOTES` al ejecutar ese comando. No reutilices un código para una APK distinta. Conserva la clave de firma: un certificado distinto impide actualizar la instalación existente.

4. Copia la APK al servidor por SSH dentro de `~/server/cloud/proyectos/Pixel/server/releases/android/` usando un nombre temporal `.upload`. Compara su SHA256 con `latest.json` antes de cambiarla al nombre definitivo. Copia después el manifiesto como `latest.json.upload` y renómbralo a `latest.json` **al final**, cuando el binario ya esté completo y verificado. Guarda copia del manifiesto anterior.
5. Comprueba los resultados:

   ```bash
   curl --fail https://pixelnosekai.com/api/app-release/android
   curl --fail --range 0-1023 -o /tmp/pixel-apk-sample.bin 'https://pixelnosekai.com/api/app-release/android/download?build=4'
   ```

   Sustituye `build=4` por el código publicado. La respuesta parcial debe ser 206 con MIME APK y el nombre de archivo correcto. Comprueba en un Android con versión anterior el aviso, la descarga y la actualización conservando la sesión.

Los binarios/manifiestos no forman parte de `dist` ni de Git, por lo que un despliegue web no los sustituye. El backend ofrece solo el archivo de la publicación validada. La URL de descarga incluye el código: un enlace obsoleto devuelve 409 para evitar descargar una APK diferente a la anunciada.

Se mantiene el certificado de desarrollo que ya usaban las APK instaladas. Antes de una distribución amplia hay que planificar una firma de producción y su transición; no sustituir la clave durante una actualización normal. El archivo `config/android-release-certificate.sha256` contiene únicamente la huella pública de continuidad.


## Evitar bloqueos de la laptop (15 de noviembre de 2026)

Compilar solo una cosa a la vez. No ejecutar el emulador durante la compilación. `npm run build:android` y `npm run build:web -- --output-dir <carpeta>` comparten bloqueo y usan un scope de systemd: máximo equivalente a dos CPU, prioridad baja, MemoryHigh=3 GiB, MemoryMax=4 GiB y máximo 512 MiB de swap. Gradle tiene un trabajador, sin tareas paralelas ni daemon persistente; Metro usa un trabajador. El flujo comprueba al menos 5 GiB de memoria disponible antes de empezar. Un límite puede hacer fallar la compilación; no se aumenta automáticamente.

`node tools/build-limited.mjs check` comprueba los límites efectivos del kernel sin compilar. Requiere Linux con systemd de usuario y cgroup v2. Abrir el emulador después de construir. Las invocaciones directas de Gradle desde el IDE tienen las restricciones de trabajadores del proyecto, pero el límite total de memoria/CPU requiere el flujo anterior.

La versión 1.0.4 (código 5) incluye el reproductor inmersivo, restauración de orientación, correcciones de botones Android y manga, siguiente capítulo al final y documentos legales integrados. El comprobador instalado desde 1.0.3 avisa al abrir o volver tras seis horas; Perfil → Preferencias → Buscar actualización permite hacerlo inmediatamente. Android siempre pide confirmar la instalación. Una APK anterior a 1.0.3 debe actualizarse manualmente una vez.

Versión publicada más reciente:1.0.5/código6 (15nov2026). Lector con enlaces limpios, imágenes originales en AndroidWebView, caché persistente de páginas, precarga/reintentos y controles de video reorganizados. Descarga por el manifiesto público; ver docs/brain/2026-11-15-lector-manga-y-controles.md para validación y límites.

Actualización1.0.6/código7: Noticias compactas específicas de Android. Ver docs/brain/2026-11-15-noticias-android-compactas.md.

Actualización1.0.7/código8: selector de servidores compartido y discreto, continuación del episodio real, apertura de capítulos con proveedores en Android. Noticias web y fuentes RSS ampliadas. Ver docs/brain/2026-11-15-noticias-web-y-reproductores.md para pruebas y limitaciones de proveedores. APK124234278bytes; SHA2560506fabca02816fe15bbd22076465c83828d9d5c67e40b889f58cdaff081b890.

Actualización1.0.9/código10: archivo de Drive priorizado sobre proveedores externos, controles−10/+10segundos, encabezado superior y una sola ventana Android al volver del reproductor al detalle. Incluye apertura desde Mi lista sin bucles y continuación al segundo0. APK124235714bytes; SHA2569ef7ee1606905122d95e08959a1dd978b61c9b762031ec0a1b81e3be4c613a72. Instalada por actualización en Samsung conectado; pendiente confirmación visual del usuario sobre la salida. Ver docs/brain/2026-11-15-drive-player-saltos-y-salida.md.

Actualización1.0.10/código11: corrección del acceso al VideoPlayer liberado que cerraba la interfaz; barra de reproducción para elegir minuto; historial de búsquedas sincronizado por cuenta/perfil, con migración local y suscripción en vivo. APK124243470bytes; SHA256ae74223135accbff3fd284b70106e284eb0c55ee8bbc36d4592bd6c4447c9bc2. Instalada en el Samsung conectado; pendiente confirmación del usuario sobre salida/capítulo anterior. Ver docs/brain/2026-11-15-player-release-timeline-sync.md.

Confirmación del usuario sobre1.0.10: al probar anterior/flecha de salida ya no aparece pantalla gris. La validación de la barra y del historial se documenta en docs/brain/2026-11-15-player-release-timeline-sync.md.

Actualización1.0.11/código12: Emisión y Buscar rediseñados para web/Android con menos rojo y marcos; resultados con filtros accesibles, calendario con disponibilidad real y mejor encuadre de arte en Inicio. APK124243066bytes; SHA2564698e0b5306c9318dd7e7669f05863ea8e9145fe39e43ae898dab8d51718f1b8. Ver docs/brain/2026-11-15-emision-busqueda-imagenes.md para validaciones y limitaciones.

APK1.0.11 instalada por actualización en el Samsung conectado; dumpsys confirma1.0.11/código12. Manifiesto, SHA256 y descarga parcial206 verificados. Pendiente revisión visual nativa del usuario.

Actualización1.0.13/código14: Inicio con menú transparente arriba y oscuro al bajar, hero más alto, tipos de lectura según metadatos, descripción plegable, Perfil ordenado, elección explícita de perfil y carga Pixel de nueve píxeles. Se publicó1.0.12/13 durante la revisión y se incrementó el código para la corrección final de transparencia. APK123524594bytes; SHA25684b48d41c837fce86fe8a2c250fbc972e2e3d0ec8f0baa7a45b6d81999ad280a. Firma, manifiesto público y descarga206 verificados. Samsung desconectado: actualización disponible por el comprobador, sin instalación en otro dispositivo. Ver docs/brain/2026-11-15-inicio-perfiles-y-lectura.md.

Actualización 1.0.14 / código 15: restaura el perfil verificado al reabrir, exige un perfil válido para contenido y enlaces directos, mejora el tema claro y las cargas silenciosas, limita sinopsis sobre imágenes y amplía formatos/filtros de lectura. Backend con traducciones gratuitas persistentes por versión del original, procesadas gradualmente. APK 123530034 bytes; SHA256 `40f35e8a53ba5ff077e6f04ddae120099619735b4bfcdfbe041b9a8392bb847f`. Compilación limitada y publicación verificadas; Samsung sin conectar, instalación y revisión física pendientes. Ver docs/brain/2026-11-15-sesion-tema-sinopsis-es.md.


Actualización 1.0.17 / código 18: detalle con contraste sobre imágenes en ambos temas; tráiler Drive adaptable; Play inicia el primer episodio reproducible y Último disponible aparece solo en series en emisión con varios capítulos; descarte de respuestas tardías; perfil móvil en una fila; formatos de lectura en Mi Lista y refresco por sección. Incluye la recuperación del detalle tras recargar y la selección diaria del hero de lecturas de1.0.16/código17. APK123585674bytes; SHA256 `a3985566f7249fe61d7d7d00e0f99deeace1a9483bf6c2216066c11cb9beb328`. Firma verificada, 141 tests; sin teléfono ADB conectado para instalación física. Ver docs/brain/2026-11-16-detalle-contraste-y-lista.md.


Actualización1.0.18/código19: categorías de H en diálogo desplazable y selección con confirmación; filtros de lecturas equivalentes a estados del origen; catálogo completo con páginas de50 y cuadrícula adaptable; miniaturas de Drive con caché acotada y precarga; bloqueo de controles Android con pulsación larga para desbloquear. Incluye la altura estable del hero de Inicio. APK123591510bytes; SHA256 `36586eabff819f8315757afd58139da3792ae5d7ce273b9b5cd53cb7a52b17fc`.147 tests y11 de seguridad pasan. Sin dispositivo ADB: instalación y gesto físico pendientes. Ver docs/brain/2026-11-16-filtros-paginacion-bloqueo.md.


Actualización1.0.19/código20: Similares deduplicado por identidad AniList/fecha, recomendaciones sobre catálogo completo, caché pública persistente acotada con revalidación y refresco sin ocultar Inicio; carga diferida web y menos tarjetas iniciales Android. APK123599350bytes; SHA256 `555bc8fe9d6d325f639cc48e3a636258f5eaf0030bf20dd5b5638f673cc362d8`.159 tests y11 de seguridad pasan. Ver docs/brain/2026-11-16-similares-y-red-lenta.md para límites de red y validaciones. No instalada físicamente.


Actualización 1.0.21 / código 22: título del lector de manga visible solo al inicio y oculto al bajar, botón flotante lateral "↑ Inicio" que acompaña al deslizar (Web y Android) más botón al final del capítulo, y corrección de acceso directo / recarga en `/admin/dashboard` web. APK 123601858 bytes; SHA256 `6710575d86b4e9c37b0795632e14bf46d54f29264994e722b8c6aef1d6055fb8`. Firma, manifiesto público y descarga HTTP 200 verificados; sin dispositivo ADB conectado para instalación física. Ver docs/brain/2026-11-16-manga-reader-admin-apk.md.


Actualización 1.0.25/código26: lector web y componente Image de respaldo llenan el ancho disponible aunque el archivo original mida199px; HTML nativo con contenedores de ancho explícito. Descarga APK con proxy Nginx específico y empaquetador que valida zipalign16. 192 pruebas aprobadas; firma fijada y descarga completa/SHA256 comprobados. El usuario conserva1.0.23/código24 y reporta App no instalada con1.0.24; el motivo exacto en Android sigue pendiente porque el teléfono solo admite depuración Wi-Fi y está en otra red. No desinstalar para actualizar. Ver docs/brain/2026-11-17-ancho-manga-descarga-apk-1-0-25.md.


Actualización 1.0.26/código27: diálogo de importación con texto correcto y espera limitada; cola local conservada, ACK tardío y exclusión de importaciones concurrentes entre perfiles. 197 pruebas aprobadas; APK firmada y descarga completa verificada. Instalada por Wi-Fi/IPv6 en el Samsung del usuario sin borrar datos: respaldo de 4 avances confirmado en el teléfono y comprobado en web. Se identificaron APK de Descargas con tamaño correcto pero contenido dañado y firma inválida. Ver docs/brain/2026-11-17-depuracion-apk-importacion-1-0-26.md.


Actualización1.0.28/código30: capítulos de manga leídos atenuados y sincronizados por perfil, unión de marcas entre dispositivos y caché acotada del lector sin recomprimir imágenes. Entrada normal independiente de la comprobación administrativa, consultas de perfil con límite y respuesta visible al seleccionar.215 pruebas aprobadas; firma fijada y zipalign16 verificados. APK123641866 bytes; SHA256 `26b550d65648e515b935d87c320f90703323238625d623b9ea060259579c4506`. Instalada sin borrar datos; el usuario confirmó que ahora entra al contenido al tocar su perfil. Las etiquetas de temporadas de1.0.24 siguen incluidas. Ver docs/brain/2026-11-17-perfiles-entrada-1-0-28.md y docs/brain/2026-11-17-temporadas-leidos-cache-1-0-27.md.
