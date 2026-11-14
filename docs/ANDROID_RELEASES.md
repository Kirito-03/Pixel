# Publicar una APK y activar el aviso de nueva versión

La APK 1.0.3 (código 4) incluye el comprobador. Las instalaciones anteriores necesitan instalarla una vez. Después, una compilación publicada con código superior se ofrece al abrir la app o al volver a ella tras seis horas. El usuario confirma la descarga y la instalación de Android; también puede buscar manualmente en Perfil → Preferencias.

1. Cambia `expo.version` y aumenta `expo.android.versionCode` en `app.json`. El código siempre debe crecer.
2. Con Android SDK y JDK configurados, sincroniza los archivos nativos y compila:

   ```bash
   node tools/android-release.mjs prepare
   cd android
   ./gradlew :app:assembleRelease
   cd ..
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
