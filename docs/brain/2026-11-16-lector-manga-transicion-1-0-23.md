# Android: controles estables del lector — 1.0.23 (24)

Fecha: 2026-11-16.

## Problema y solución
La 1.0.22 desmontaba el título al cruzar 24px. Eso cambiaba la altura disponible del WebView, modificaba su scroll y podía hacer que el título apareciera y desapareciera repetidamente.

- El WebView ahora mantiene una altura estable; título y Header quedan en una capa superpuesta siempre montada.
- Los controles superiores usan desplazamiento y opacidad de 240ms. Se ocultan a partir de 112px y reaparecen al volver a 24px; los movimientos intermedios conservan el estado.
- El menú inferior es una capa superpuesta durante la lectura nativa. Baja al acumular 56px descendentes y reaparece con 32px ascendentes, ignorando ruido menor de 2px. Sale del modo lector al perder foco y restaura el menú.
- Se respeta Reducir movimiento del sistema y se bloquean toques y accesibilidad de controles ocultos.
- HTML mantiene espacio superior e inferior constante. Ir al inicio queda por encima del menú para que pueda pulsarse.
- Volver en detalles usa la altura real del Header y el área segura superior, más 24px de separación y área táctil de 44px.
- Header usa área segura superior y lateral, sin añadir el área de gestos inferior a su altura.

## Validación
- 173/173 pruebas Node aprobadas. Nuevos casos: histéresis del título, cambios de dirección del menú, offsets del puente y reserva estable del WebView; prueba de navegación anterior/siguiente y restauración al salir.
- TypeScript sin errores nuevos; persisten dos errores previos de expo-file-system en services/offlineDownloads.ts:83.
- agy solicitado para revisión en modo solo lectura; terminó por timeout sin dictamen. No se considera una validación aprobada.
- APK compilada correctamente en 2m55s mediante npm run build:android con JDK21, 2 CPU y 4GiB máximo. No se ejecutó emulador en paralelo.
- Firma contrastada con certificado fijado, zipalign correcto. Publicada 1.0.23/code24 tras comprobar SHA256 remoto. API y descarga Range206/ZIP verificadas.
- APK: pixel-1.0.23-24.apk, 123606146 bytes, SHA256 5ed338890325f08508b994c26c676dc7598422e5f46f83f1451c81067f029fd8.
- Descarga: https://pixelnosekai.com/api/app-release/android/download?build=24
- Pendiente comprobación manual en el teléfono del usuario. No se instaló en la tablet que aloja el servidor.

## Pendiente separado: sincronización
Esta versión aborda controles y distribución. Manga continúa con guardado local sin separar perfiles; H todavía no guarda progreso. Anime tiene Firestore por perfil, pero falta comprobar ambos dispositivos. La migración de lecturas antiguas a un perfil debe evitar asignar datos locales sin dueño a otro usuario. No borrar datos de la APK.
