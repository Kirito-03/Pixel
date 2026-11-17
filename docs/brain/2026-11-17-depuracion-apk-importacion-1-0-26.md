# Depuración del teléfono, APK dañadas e importación — 1.0.26 (27)

Fecha: 2026-11-17. Revisión sobre el teléfono real del usuario, Samsung SM-A155M con Android 16.

## Instalación: causa comprobada y recuperación

- El teléfono tenía 1.0.23/código24 y 147 GiB libres. La ruta IPv4 anunciada por mDNS agotaba la conexión TCP tanto al vincular como al conectar. Se resolvió la dirección IPv6 link-local del mismo dispositivo anunciado y se conectó ADB indicando la interfaz local. No se cambió la configuración de red ni se guardaron códigos de vinculación en notas/archivos.
- Las APK 1.0.24 y 1.0.25 de Descargas tenían el tamaño esperado pero SHA256 diferente del original. Ambas copias extraídas del teléfono fallan apksigner con APK integrity check failed / CHUNKED_SHA256 digest mismatch; ZIP también detecta un miembro inválido.
- En esa copia había un tramo continuo de 22299198 bytes de ceros, entre offsets 91663258 y 113962455, donde el original contiene datos. El tamaño aparente no probaba una descarga íntegra. No se determinó qué componente de la transferencia introdujo el daño.
- Hashes de los artefactos originales del servidor seguían correctos. La copia original 1.0.25 se instaló por ADB con -r y --no-incremental. Después se hizo lo mismo con 1.0.26.
- El paquete conserva su UID y la fecha original de instalación; PackageManager informa Retain data. No se desinstaló, no se borraron datos ni se eliminaron las lecturas antiguas.
- Se dejó en Descargas pixel-1.0.26-27-verificada.apk y se comprobó su SHA256 en el propio teléfono contra el artefacto original.

## Calidad de las páginas

Se pudo abrir la página pública del proveedor en el navegador, aunque las consultas HTTP directas devolvían 403. Las tres imágenes del capítulo 30 del caso reportado miden 199×8000, 193×8000 y 267×8000 píxeles en la propia fuente. Usan los mismos archivos que Pixel y no ofrecen srcset, data-original ni data-full-url de mayor tamaño en esa página. Para mejorar detalle hace falta una fuente/archivo de mayor resolución; el ajuste visual de ancho no reconstruye píxeles ausentes. No se descargaron variantes inventando rutas.

## Importación y diálogo bloqueado

- Se utilizó scrcpy de solo visualización, limitado a 1024px/15fps/sin audio. Se respetó la pantalla de bloqueo y el usuario desbloqueó el teléfono. La importación estaba visible con el botón Eliminando aunque la acción no elimina archivos.
- ConfirmDialog usaba ese texto para cualquier operación pendiente. Ahora admite busyText; la importación muestra Importando y otras acciones no destructivas muestran Guardando. Cerrar/reabrir invalida el callback antiguo y no conserva loading ni permite que una respuesta vieja desbloquee otra solicitud.
- Los registros mostraban un Commit de Firestore con error unavailable. Cada lectura/transacción tiene plazo de 20s y dos intentos de transacción; la espera del botón se limita a 30s. El vencimiento no equivale a cancelar una escritura: se conserva la cola local y solo un ACK real del servidor la confirma.
- Una sola importación antigua puede estar activa por instancia de la app. Los reintentos del mismo perfil comparten la operación; otro perfil espera a que termine, evitando reclamaciones concurrentes de los mismos archivos.
- Errores de sincronización e importación separados; callbacks tardíos protegidos por cuenta/perfil. La confirmación de nube se muestra separadamente de las copias antiguas sin importar de cada dispositivo.
- El aviso de importación puede finalizar después del plazo UI si llega el ACK. Las fuentes locales originales se conservan; los marcadores de importación requieren confirmación, sin atribución automática a otro perfil.

## Validaciones y publicación

- 197/197 pruebas Node aprobadas. Casos nuevos: texto de carga, cierre/reapertura con callback pendiente, estado cloud separado de legacy, deadline con outbox conservada y ACK tardío, una importación simultánea y exclusión entre perfiles.
- TypeScript: únicamente los dos errores previos de expo-file-system en services/offlineDownloads.ts:83.
- Revisión agy de solo lectura: los hallazgos iniciales de UI/callbacks/concurrencia se mitigaron; revisión final sin fallos graves. Registros en work/agy-import-126.log y work/agy-import-126-final.log fuera de Git.
- Web exportada y APK compilada con los wrappers limitados del proyecto, JDK21, 2 CPU, máximo 4 GiB y un trabajo; sin emulador. APK compilada en 2m47s.
- Web: 44 archivos verificados; assets antes de index. SHA256 del HTML publicado y exportado: a6fe56a3790ba824f78c03d73ea59645b7aaaf21a7c0ef48890dae2bee86c542.
- APK 1.0.26/código27: 123633546 bytes; SHA256 9ff0a0f1d14918706ee3d794c44a4e7c4aad044da6531f68cecc9a75660ce02e. Certificado fijado y zipalign16 comprobados. Publicación remota tras hash/tamaño y antes de reemplazar el manifiesto.
- Descarga pública completa HTTP200 en 113,77s con SHA256 idéntico. También copia del mismo artefacto instalada y verificada en el teléfono.

## Resultado real confirmado

En el teléfono 1.0.26/código27 aparece Respaldo confirmado en la nube, 4 avances de lectura/H y ningún aviso/botón de lecturas antiguas pendientes. En la web se observan los mismos 4 registros y un botón Continuar recupera el capítulo guardado desde el teléfono. La comprobación web abrió el detalle, no el capítulo, para no modificar su progreso.

La confirmación no se obtuvo borrando datos del teléfono. Las pruebas unitarias sí cubren restaurar el progreso en un cliente nuevo. El texto Importando y la recuperación ante deadline se verificaron con tests; en la comprobación final física la importación ya había concluido.

Captura local de validación (fuera de Git): work/phone-backup-confirmed-126.png. scrcpy se cierra al terminar la revisión; no queda una captura continua.

Descarga vigente: https://pixelnosekai.com/api/app-release/android/download?build=27

## Copia a Obsidian pendiente

Al cerrar esta revisión, Reze vuelve a estar desmontada. El MCP pixel_brain devuelve Vault root directory does not exist; la escritura de esta nota y la ampliación del índice externo no se realizaron. La nota completa y el índice local sí están guardados en docs/brain y Git. Copiar por MCP y verificar lectura cuando se monte de nuevo la bóveda.
