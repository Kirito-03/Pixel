# Pixel en Android Studio / emulador

## Estado del 13 de noviembre de 2026

Android Studio está instalado mediante Flatpak (`com.google.AndroidStudio`). El SDK está en `/home/arle/Android/Sdk` y existe el AVD `Medium_Phone_API_37.0`.

Se compiló correctamente el APK de desarrollo para **x86_64**:

`/home/arle/Documentos/Projects/pixel/android/app/build/outputs/apk/debug/app-debug.apk`

Resultado: `BUILD SUCCESSFUL`, 593 tareas (103 ejecutadas, 490 actualizadas). El APK es para el emulador Intel/AMD; no se presenta como buildARM para un teléfono/tablet físico.

## Reparaciones efectuadas

- El JBR25 incluido con Studio no funciona con Gradle8.14.3 (`Unsupported class file major version69`). Se usó Temurin21 oficial, sin cambiar Java global de la computadora.
- Se restauraron paquetes incompletos desde sus versiones exactas de package-lock.json: @react-native/gradle-plugin, expo-modules-autolinking, expo-modules-core, react-native-screens, react-native-reanimated, expo-dev-launcher, expo-dev-menu, expo-file-system, expo-image-picker, expo-manifests y expo-updates. No se actualizó la versión de estas dependencias.
- Se descartó la caché generada de autolinking que contenía rutas Windows. No copiar android/build entre Windows y Linux.
- Gradle instaló Platform36 usando la licencia que ya estaba aceptada en el SDK. Se limitaron tareas concurrentes a2.

## Ejecutar la app de desarrollo

Abrir Android Studio → Device Manager → iniciar `Medium_Phone_API_37.0`. El dispositivo debe aparecer en `adb devices`.

En una terminal, desde el repositorio:

```bash
export JAVA_HOME=/home/arle/Documents/Codex/2026-11-13/primero-lo-urgente-renueva-hoy-30-2/work/jdk21
export ANDROID_HOME=/home/arle/Android/Sdk
export EXPO_PUBLIC_API_URL=https://pixelnosekai.com
npx expo run:android
```

La URLAPI explícita evita apuntar a `10.0.2.2:3001` cuando no existe backend local. Mantener `.env` privado. El APKdebug usa el cliente de desarrollo y necesita Metro; no es un APK de distribución autónomo.

Para reconstruir solo el APK con el SDK/JDK anteriores:

```bash
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64 --max-workers=2 -Dorg.gradle.parallel=false
```

El JDK de esa ruta vive en el directorio de trabajo del chat; si se limpia ese directorio, instalar un JDK21 y actualizar JAVA_HOME (o GradleJDK en Studio). No seleccionar automáticamente JBR25 en este proyecto.

## Validación que sigue pendiente

El AVD pudo arrancar y aparecer enADB, pero no se mantuvo conectado en la comprobación final. No se declara instalación/ejecución final del APK ni loginAndroid verificados. La revisión con navegador390px sirve para responsive, no sustituye el emulador real.

Comprobar en el AVD: acceso y perfiles, barra inferior/safeareas, botónAtrás, carruseles táctiles, detalles, trailer silenciado a3segundos, reproducciónAV1 del archivoautorizado, lector y administración. El proveedor del manga probado devuelve403 para páginas; tampoco se da esa lectura por reparada.
