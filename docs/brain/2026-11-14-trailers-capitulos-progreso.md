# Tráilers, navegación de capítulos y progreso — 2026-11-14

## Implementado

- Tráiler web y Android solicita sonido al iniciar. Web usa la API oficial de YouTube con onAutoplayBlocked, fallback silenciado y acción explícita para reproducir con sonido. Se eliminó el recorte del iframe que intentaba ocultar partes de YouTube. Se mantiene controls=0; canal, título, marcas y avisos de pausa/inicio no se pueden garantizar ocultos con parámetros soportados. Los navegadores pueden exigir un toque para autorizar sonido.
- Con agy-cli: navegación genérica del catálogo restringido conserva la misma serie al volver del reproductor. El botón principal abre el primer capítulo real; anterior/siguiente usan la secuencia numérica existente, incluyendo decimales y saltos (1, 2, 10), sin inventar número +1. El último no muestra siguiente. Peticiones atrasadas se descartan al cambiar título, perfil o desactivar +18. Episodios ordenados de menor a mayor.
- El progreso anterior iba a endpoints SQL que exigían otra identidad de usuario/perfil, mientras favoritos y sesión usan Firebase. Además EpisodePlayer.web no enviaba progreso. Se unifica en Firestore profiles/{uid}/profiles/{profileId}/watch_progress/{animeId}, privado del dueño y validado por reglas publicadas hoy 10:42 (copia previa fuera del repo).
- Vídeo directo: progreso real, guardado periódico de 15 s y al pausar/salir/finalizar; reanudación desde el minuto guardado y siguiente episodio real al completar. Android también guarda al pasar a segundo plano. Escrituras por anime/perfil ordenadas para evitar que una escritura lenta del capítulo anterior gane a la nueva.
- WebView con vídeo accesible reporta posición real y permite restaurarla. Iframes externos que impiden medir el tiempo guardan únicamente el capítulo abierto, position_known:false. La interfaz avisa que ese servidor no permite guardar el minuto. No se atribuyen segundos o porcentajes inventados.
- Mi Lista muestra capítulo y porcentaje conocido en guardados y la fila Continuar viendo. Los favoritos permanecen visibles si falla la lectura del historial, con reintento. No se reconstruye retroactivamente el historial que nunca se guardó. El nuevo progreso corresponde al reproductor de anime; el catálogo H recibe navegación, sin unificar su historial todavía.

## Validación

- 55 pruebas Node pasan: aislamiento por cuenta/perfil, datos inválidos, orden de escrituras lentas, reanudación, fin de serie, secuencia de episodios, progreso web y nativo con mocks, retroceso de tiempo, pausa/salidas y autoplay bloqueado.
- TypeScript mantiene errores previos en Loader, useProfileManagement, AiringScreen, LegalScreen y offlineDownloads; sin errores en los archivos de esta tarea.
- QA web aislado con datos neutros: Mi Lista a 390 px sin desbordamiento horizontal; capítulo/30% visible; marcador de capítulo sin minuto claramente indicado. En una serie de prueba se recorrió 1 → 2 → 10, se ocultó siguiente al final y volver abrió la misma ficha. No se abrió contenido adulto real.
- Expo export y Gradle release exitosos. Sin prueba física de la nueva APK; sonido/pausa nativos necesitan comprobarse en el teléfono.
- Reglas Firestore publicadas, sin modificar reglas existentes de favoritos ni permitir acceso de otras cuentas. Backend sin cambios para esta tarea.
- Frontend desplegado en Termux con respaldo de dist; HTML público /mylist verificado con el bundle index-ccb33793ac78f8b0111a9aed3eec0663.js.
- APK fuera del repositorio: outputs/pixel-android-progreso-2026-11-14.apk, 124209202 bytes, SHA256 4b8e7d3730ff39e3d2c62cf858bcd69ec72dc7b9a144d4669c3890836366cbc0.

## Referencias y límites

- https://developers.google.com/youtube/player_parameters — showinfo/modestbranding obsoletos; no prometer ocultar branding.
- https://developers.google.com/youtube/iframe_api_reference — eventos oficiales de reproducción y onAutoplayBlocked.
- https://developer.chrome.com/blog/autoplay — restricciones de reproducción automática con sonido.
- Pendiente validar en Android físico. El progreso exacto de proveedores que bloquean acceso al vídeo requiere API oficial del proveedor o un vídeo directo autorizado; no puede resolverse leyendo un iframe cross-origin.
