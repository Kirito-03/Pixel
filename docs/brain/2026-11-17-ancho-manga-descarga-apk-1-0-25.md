# Ancho del lector y descarga APK — 1.0.25 (26)

Fecha: 2026-11-17.

## Reporte del usuario y alcance

El teléfono conserva Pixel 1.0.23 / compilación 24. Al intentar actualizar a 1.0.24 aparece «App no instalada». También se ven páginas estrechas en Un Mundo sin Hombres, capítulo 30. El celular solo admite depuración Wi-Fi y actualmente está en otra red; no fue posible leer PackageInstaller ni instalar por ADB. No desinstalar ni borrar datos: las lecturas antiguas del teléfono todavía necesitan importarse al perfil.

## Hallazgos y cambios

- La primera página entregada por el endpoint del capítulo 30 es un JPEG de 199×8000 píxeles. El proxy envía los bytes recibidos sin redimensionarlos. Ampliar esa página llena el ancho, pero no reconstruye detalle ausente del archivo recibido. No se confirmó otra versión de mayor resolución.
- ReaderImage.web limitaba la columna a min(ancho original,800), por lo que tras cargar esa imagen la columna podía reducirse a 199px. Ahora siempre usa 100% del espacio, con máximo de 800px en escritorio y altura proporcional.
- El componente nativo Image de respaldo elimina el mismo límite por resolución original y no reutiliza la proporción de otra URI. El lector Android principal utiliza NativeMangaPages/WebView, cuyo HTML ya solicitaba 100% de ancho: se reforzaron el ancho de html/body/nav y el máximo de img, sin cambiar la navegación ni el progreso.
- La descarga completa inicial de la 1.0.24 por HTTP/2 se interrumpió antes del tamaño esperado. Reanudada por Range206 dio exactamente el SHA256 del original. Esto demuestra una transferencia interrumpida en la prueba, no la causa exacta del rechazo en el teléfono.
- Se agregó una ubicación Nginx exclusiva para /api/app-release/android/download: sin buffering, sin Upgrade de websocket, Range/If-Range conservados y timeouts de 600s. Sigue pasando por el backend que valida versión/nombre/tamaño; no se expone ningún directorio. Configuración de referencia en config/nginx/pixel-apk-download.conf y equivalente Docker en frontend/nginx.conf.
- Se conservó la configuración previa de Nginx en server/backups/nginx-before-apk-125-1794929483776.conf de la tablet. nginx -t y recarga correctos. No se reinició el backend ni los bots para este cambio.
- El empaquetador ahora exige zipalign y valida -c -P16 4 además de aapt, firma y certificado fijado. Esto verifica alineación ZIP; no sustituye una prueba física del dispositivo.

## Validaciones

- 192/192 pruebas Node aprobadas. Nuevos casos: imagen 199×8000 después de onLoad, ancho móvil/escritorio, cambio de URI sin proporción antigua y reanudación APK con dos rangos que reconstruyen el archivo.
- TypeScript conserva únicamente los dos errores anteriores de expo-file-system en services/offlineDownloads.ts:83; no aparecieron errores nuevos.
- Prueba aislada en navegador con HTML real del lector y una imagen de prueba de 199px: viewport solicitado 390px, área útil de 375px, página de 375px e imagen de 375px; escritorio de 1280px/área de 1265px, página e imagen de 800px. Sin desbordamiento horizontal; viewport restablecido y servidor de prueba cerrado. No se alteró el progreso real del usuario para realizar la prueba.
- La prueba anterior valida HTML adaptable en navegador; todavía no es una prueba física de Android WebView.
- agy-cli revisó en modo solo lectura lector, empaquetado y descarga. Se contrastaron sus hipótesis: los timeouts de recepción de peticiones Node no se trataron como causa demostrada del stream. Registro externo work/agy-apk-manga-width-125.log.
- Web exportada por npm run build:web, 44 archivos verificados en servidor; assets primero e index al final. HTML público y exportación: SHA256 ecfc26fa81090bb92aeb86d11c3825e8c20b2f39464a1f6dc130bc3ad2dd305e.
- APK compilada por npm run build:android con JDK21 en 1m 56s, un trabajo, 2 CPU y máximo 4 GiB; sin emulador en paralelo. 1.0.25/código26, tamaño 123631630 bytes, SHA256 74346ed80668ec55faf0863f047ec00bbc59134db03a54293122ec57bd3d40a0. Certificado idéntico al de 1.0.23 y validación zipalign con 16 KiB aprobada.
- Publicada tras verificar hash remoto antes de reemplazar latest.json. Descarga pública completa en una transferencia HTTP 200: 123631630 bytes en 68,48s, SHA256 idéntico. Manifiesto, Range206 y firma del archivo descargado comprobados.

Descarga vigente: https://pixelnosekai.com/api/app-release/android/download?build=26

## Pendiente

- Confirmar la actualización física sobre 1.0.23. Si vuelve a fallar con la descarga nueva completa, obtener el motivo exacto de PackageInstaller cuando el teléfono sea accesible por depuración Wi-Fi; no atribuirlo a firma, espacio o versión Android sin evidencia.
- Comprobar el capítulo 30 en ese celular. El HTML y las pruebas no confirman por sí solos el comportamiento del WebView instalado.
- Después de actualizar, importar las lecturas antiguas a la cuenta/perfil correcto en Perfil → Preferencias → Respaldo de lecturas y H. Esperar confirmación de nube y comprobar continuidad web. No se han recuperado ni subido automáticamente los 12 capítulos del teléfono.

## Referencias técnicas

- Android adb, actualización -r conservando datos: https://developer.android.com/tools/adb
- Nginx proxy buffering y timeouts: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- React Native WebView: https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md
