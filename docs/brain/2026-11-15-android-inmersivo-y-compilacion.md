# Android 1.0.4 y compilaciones con recursos limitados

Fecha: 15 de noviembre de 2026 (Lima).

## Implementado y publicado

- APK 1.0.4, versionCode 5. Certificado verificado contra la huella ya utilizada por instalaciones existentes. Tamaño 124218910 bytes; SHA256 `411f4206d33a6fcad4d95c826cb5b864588211c469e5de96830c1d1261a84619`.
- Manifiesto https://pixelnosekai.com/api/app-release/android devuelve 1.0.4/5. Descarga https://pixelnosekai.com/api/app-release/android/download?build=5 comprobada por rango: HTTP206, MIME APK, nombre correcto, bytes0-1023/124218910. El binario se publicó tras comprobar SHA256 en la tablet; el manifiesto se reemplazó al final con copia previa en server/backups.
- Frontend publicado con bundle `index-40c5b9e7db56564cb584b7a6205d1776.js`; respaldo de dist anterior y conservación de chunks antiguos para sesiones abiertas. Perfil y API HTTP200.
- Ventana de reproductor: vista nativa PlayerSystemBarsView controla las barras de la ventana real del Modal; Expo actuaba sobre la Activity de fondo. Usa WindowInsets desde API30 y flags inmersivos en versiones anteriores. Devuelve visibilidad previa al desmontarse y reaplica al recuperar foco. Los gestos de Android pueden revelar temporalmente las barras.
- Orientación de entrada/salida serializada para que una solicitud de landscape pendiente no se complete después de restaurar portrait. Inicio usa ancho del contenedor y distribución flexible para evitar botones fuera de pantalla tras rotar.
- El encabezado del reproductor no reinicia su temporizador por cada reporte periódico de progreso: se oculta tras 3,5s de reproducción y reaparece al interactuar/pausar.
- Manga: ficha móvil con ancho limitado al contenedor, márgenes20px y botones flexibles. Carrusel cada7s sigue rotando después de flechas/indicadores; pausa con hover web, app en segundo plano y reducir movimiento. Lector muestra Siguiente capítulo al final cuando existe; usa el capítulo real de la secuencia descendente de la API, no suma números arbitrarios.
- Perfil ofrece Términos y condiciones/Privacidad dentro de la app. Texto incluido localmente, separación de párrafos corregida, safe areas y rutas legal/:type. Se comprobó abrir términos desde Perfil en la web publicada.
- Avisos de actualización existentes desde1.0.3: inicio y regreso tras6h; comparación por versionCode; buscar manualmente en Perfil→Preferencias. Descarga e instalación requieren acción del usuario. No se instala silenciosamente.

## Congelamiento de laptop y corrección

La APK y la exportación web coincidieron con el emulador. El equipo tiene15GiB útiles, CPU i5-12500H con16CPU lógicas. Al investigar se observó carga media5min42,55, swap2,2GiB, presión de memoria full~13% y de I/O full~49,5% en ventana300s. Son mediciones posteriores, no un perfil completo del instante del bloqueo; apuntan a presión de recursos. El kernel consultado no mostró mensajes OOM en la última hora. No se atribuye a un fallo de hardware.

Un daemon Gradle retenía~2,5GiB RSS. Se detuvo de forma normal con gradlew --stop. El emulador de prueba ya no estaba corriendo. MemAvailable aumentó de6,4GiB a9,1GiB tras liberar Gradle (varía con otras apps). No se cerraron aplicaciones del usuario.

- `npm run build:android` y `npm run build:web -- --output-dir <destino>` usan tools/build-limited.mjs.
- Un solo trabajo por proyecto mediante flock; prioridad nice15 e I/Oidle; CPUQuota200% (equivalente a2CPU), MemoryHigh3GiB, MemoryMax4GiB, MemorySwapMax512MiB; mínimo5GiB disponibles para empezar.
- Gradle1trabajador, sin paralelo ni daemon persistente; Kotlin en proceso; Metro1trabajador; CMake1trabajador. El config plugin conserva límites de Gradle después de prebuild. Android/ generado no se versiona.
- Se verificaron límites efectivos dentro del scope con `node tools/build-limited.mjs check`: cpu.max200000/100000; memory.high3221225472; memory.max4294967296; memory.swap.max536870912. Esta comprobación no recompila la APK. Una compilación puede fallar por el límite; no se eleva automáticamente.
- No ejecutar emulador y compilaciones simultáneas. AGENTS.md registra este procedimiento. JAVA_HOME debe apuntar a JDK21; SDK local en /home/arle/Android/Sdk. Consultar docs/ANDROID_RELEASES.md.

## Validación y límites

- 70testsNode pasaron para navegación, progreso, temas y avisos, incluidos4regresiones nuevas: temporizador del encabezado, carrusel tras interacción, capítulo siguiente/último y cierre durante orientación pendiente.
- Build release final Gradle BUILD SUCCESSFUL, exportweb correcta. TypeScript mantiene errores previos en Loader, useProfileManagement, AiringScreen y offlineDownloads; ningún error en los archivos modificados tras corregir LegalScreen.
- Instrumentación nativa en AVD API37 sobre la vista real empaquetada: PASS al ocultar/restaurar ambas barras dentro de Dialog vacío. No se reprodujo contenido ni se autenticó una cuenta en ese ensayo. Fuente tools/android-tests/PlayerBarsInstrumentation.java.
- Falta verificar el recorrido completo en el Samsung del usuario después de instalar1.0.4: entrar/salir de capítulos varias veces, márgenes, pausa, fullscreen de proveedores y siguiente capítulo real. No se afirma prueba física completa.

## Sincronización de notas

El intento de escribir el resumen a través de MCP pixel_brain devolvió `Vault root directory does not exist`. La bóveda externa de Obsidian no está montada; la nota completa y el índice quedan en este proyecto para sincronizar cuando vuelva a estar disponible. No se afirma copia externa completada.
