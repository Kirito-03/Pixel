# CloudConvert: proveedor opcional, aún no activado

Se preparó un job de ejemplo revisable para probar la API, no un worker productivo. No hay clave API configurada ni se enviaron archivos o jobs a CloudConvert desde estas herramientas. El archivo original ya archivado en Drive no se sustituye. La cola FFmpeg de la tablet sigue funcionando.

## Alcance gratuito verificado el 13 de noviembre de 2026

La página oficial anuncia 10 créditos/día, 1 GB máximo por archivo, hasta 5 minutos de procesamiento por tarea y 5 tareas concurrentes. Los créditos se consumen según tiempo/tipo de conversión; 10 créditos no garantizan 10 capítulos completos. Los 5 minutos son de procesamiento, no duración del video. No se conoce el rendimiento de esta cuenta con un capítulo AV1 1080p; requiere un piloto. No asumir que GPU, prioridad alta o conversiones largas estén incluidas sin probar sus condiciones.

Fuentes:
- https://cloudconvert.com/pricing
- https://cloudconvert.com/apis/video-encoding
- https://cloudconvert.com/docs/import-export/import-files
- https://cloudconvert.com/docs/import-export/export-files

## Piloto manual en la web

Con el archivo `source-av1-1080p.mp4` seleccionado: elegir MP4 y, en las opciones disponibles, H.264/x264, altura máxima720p sin aumentar resolución y audioAAC. Si ofrece calidad constante, comenzar conCRF24–26; confirmar las opciones reales mostradas por la web antes de aplicarlas. MP4 identifica el contenedor: cambiar solamente la extensión no asegura una conversión de AV1 a H.264.

Comparar tiempo de conversión, créditos consumidos, tamaño final, audio/subtítulos y reproducción antes de decidir un uso recurrente. Conservar el originalAV1 de125635937bytes: H.264 puede ocupar más espacio y esta operación es con pérdida. El original mantiene su calidad exacta al copiarlo; ninguna reconversión garantiza conservarla exactamente.

## Diseño para automatizar

`job.example.json` usa el flujo documentado `import/upload -> convert -> export/url`. Debe ajustarse con el Job Builder a los parámetros admitidos antes de ejecutar. Las credenciales solo van en backend/archivo privado fuera de Git, nunca en EXPO_PUBLIC_*, JavaScript del navegador, reportes o notas. No pegar claves en el chat. Requiere crear/configurar una clave de CloudConvert para esta integración.

Un adaptador completo debe persistir el job_id remoto antes de enviar el archivo, recuperar el mismo job tras reiniciar, consultar estados con espera y límite, y descargar/exportar la salida antes de24h. Luego debe verificar la copia privada en Drive antes de marcarready. No duplicar trabajo en tablet y CloudConvert. Al agotar cuota, pausar y conservar el original; no comprar créditos, activar auto-refill ni enviar lotes por defecto. Los webhooks, si se añaden, necesitan verificar firma y rechazar replays; al principio es más simple consultar estados desde el worker privado.

La exportaciónGoogleCloudStorage documentada es distinta de GoogleDrive personal. Para tus5TB se mantiene rclone autorizado: el bot recoge el resultado y lo sube a Drive privado. CloudConvert no resuelve por sí mismo la reproducción pública de esos archivos.
