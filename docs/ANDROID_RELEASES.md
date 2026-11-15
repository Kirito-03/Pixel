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
