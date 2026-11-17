# Respaldo por perfil, bloqueo y temporadas — 1.0.24 (25)

Fecha: 2026-11-17. Rama: kirito.

## Cambios implementados

- Lecturas y títulos H usan progreso separado por UID de Firebase y perfil. Cola local persistente en AsyncStorage y respaldo en Firestore; se restaura al entrar con la misma cuenta/perfil desde una instalación nueva o la web.
- Progreso manga guarda el último capítulo, no un historial completo de páginas ni una lista de cada capítulo leído. Mi Lista y detalles reciben las actualizaciones del mismo contexto.
- H guarda episodio y, cuando el reproductor expone tiempo, minuto/duración cada 15 segundos y al pausar, cambiar capítulo o salir. Los iframes externos opacos solo permiten guardar el episodio, no el minuto exacto.
- Los capítulos antiguos sin propietario no se asignan automáticamente: Perfil → Preferencias → Respaldo de lecturas y H → Importar al perfil correcto. La importación conserva fecha original, no pisa un cambio más reciente en la nube y solo marca la copia importada tras confirmación del servidor. Los archivos locales originales se conservan.
- Anime conserva su implementación previa de watch_progress por perfil; este panel y su contador corresponden a manga/H.
- La cola reintenta pendientes al volver al primer plano y cada 15 segundos mientras hay errores o pendientes. Cambios que llegan durante una subida se drenan sin perderse; la confirmación no usa snapshots optimistas ni caché local de Firestore.
- Un error de lectura local no equivale a una lista vacía. JSON corrupto se copia antes de recuperar; si la copia no puede guardarse, se interrumpe la recuperación.
- El botón de bloqueo Android se oculta a los 1,8 segundos con animación de 220 ms. Tocar la pantalla revela el botón; mantenerlo 700 ms desbloquea. La capa que intercepta toques sigue montada al ocultar el botón y no revela el título del reproductor.
- Fichas independientes como Black Clover 2nd Season mostraban Temporada 1 porque los episodios están en el grupo local 1. Se separó la etiqueta visual del número interno: se presenta Temporada 2 cuando el título lo explicita y hay un solo grupo local 1. Múltiples grupos conservan sus números; Part/cour/año no se interpretan como temporadas. IDs, rutas, descargas y referencias de progreso no se renumeran. El estado En emisión es independiente.

## Arquitectura y límites

- Firestore: documento propietario profiles/{uid}, mapa content_progress_v1.{profileId}.{kind:id}. Usa las reglas ya desplegadas para preferencias/búsquedas; no se ampliaron permisos. La transacción comprueba que el perfil seleccionado todavía exista y conserva ajustes y otros perfiles.
- La cola local incluye UID y profileId; los eventos y lecturas de una cuenta anterior no contaminan la cuenta actual. Resolución de conflictos por updatedAt y revisión para desempate. Depende de relojes de dispositivo razonablemente correctos.
- Límite técnico pendiente: estos mapas comparten el máximo de 1 MiB del documento Firestore. Para catálogos personales grandes conviene migrar a documentos por título con reglas dedicadas. Si el servidor rechaza una subida, queda pendiente localmente y no se muestra respaldo confirmado.
- No borrar datos ni desinstalar la versión antigua antes de actualizar e importar. Una actualización instalada encima conserva las lecturas anteriores. Solo los datos confirmados en la nube sobreviven a borrar los datos locales.

## Validaciones realizadas

- 190/190 pruebas Node aprobadas: aislamiento entre perfiles/cuentas, restauración en instalación nueva, cola offline y reintentos, cambio durante una subida, snapshots optimistas, fallo de almacenamiento, transacciones, importación antigua y conservación de minuto H. También bloqueo/desvanecimiento y etiqueta de temporada sin cambiar referencias internas.
- TypeScript no añadió errores. Persisten dos errores anteriores de expo-file-system en services/offlineDownloads.ts:83 (documentDirectory/cacheDirectory).
- Revisión con agy-cli en solo lectura de temporadas y bloqueo terminada sin fallos concretos; registro work/agy-backup-season-124.log fuera del repositorio.
- Exportación web por npm run build:web y APK por npm run build:android con JDK21, 2 CPU, máximo 4 GiB, un trabajador. No se ejecutó emulador en paralelo. APK compilada correctamente en 2m46s.
- Web desplegada verificando SHA256 de sus 44 archivos; assets primero, index.html al final, copia del HTML anterior conservada. Hash de HTML público y local coinciden: f550d788b559be0adf00cf0d1ed6fc2709b91c41681c0cf197f6b3b1801b3638.
- Navegador autenticado real: el panel de Preferencias lee la nube y detecta 3 lecturas antiguas en esta laptop. No se importaron automáticamente. Black Clover muestra Temporada 2 en Último disponible y lista de episodios; sigue En emisión con 7 capítulos disponibles.
- APK firmada con certificado fijado y zipalign correcto: pixel-1.0.24-25.apk, 123631506 bytes; SHA256 865007975402430ba6e79711c13bbfc0884f52b45f412544ae6da9bf80b471b6.

## Pendiente de comprobación en el teléfono

1. Instalar 1.0.24 encima de la APK actual, sin desinstalar ni borrar datos.
2. Entrar con la misma cuenta y perfil; importar lecturas anteriores desde Preferencias.
3. Esperar Respaldo confirmado en la nube sin pendientes y recargar la web en ese mismo perfil.
4. Comprobar el capítulo real del teléfono y probar el bloqueo en anime/H. No se ha afirmado que los 12 capítulos del teléfono ya estén respaldados: sus datos locales no están accesibles desde esta laptop.

## Publicación y Obsidian

APK publicada tras verificar SHA256 y tamaño remoto antes de sustituir latest.json. La API pública confirma 1.0.24/code25 y SHA256 esperado; descarga parcial HTTP206 con Content-Range 0-3/123631506 y cabecera ZIP PK0304.

Descarga: https://pixelnosekai.com/api/app-release/android/download?build=25
Unidad Reze montada de nuevo el 2026-11-17. MCP pixel_brain comprobado con lectura y escritura; esta nota y su enlace del índice se sincronizan con la bóveda externa Pixel. Las notas anteriores que indicaban sincronización manga/H pendiente describen versiones previas a 1.0.24.


## Comprobación adicional tras continuar — 2026-11-17

- La API pública sigue ofreciendo APK 1.0.24/código25 con SHA256 esperado.
- En Preferencias web del perfil kirito, el panel muestra 0 lecturas/títulos H respaldados y detecta 3 lecturas antiguas de esta laptop sin importar. Esto no demuestra pérdida de datos del teléfono: todavía falta importar desde la APK del celular al perfil correcto y comprobar la recepción en web.
- ADB no detecta dispositivos conectados; no se instaló ni se modificó ninguna APK en un dispositivo durante esta comprobación.
- Se solicitó al usuario el estado del panel de respaldo en el teléfono. No se asignaron automáticamente las lecturas antiguas de la laptop a ningún perfil.
