# CloudConvert como proveedor opcional — 13 noviembre 2026

El usuario mostró captura de cloudconvert.com/mp4-converter con un archivo fuente de unos120MiB. Se verificó la documentación oficial, no dominios similares.

El plan gratuito anuncia10créditos diarios,1GB por archivo,5minutos máximos de procesamiento por tarea y5tareas concurrentes. No equivale a10capítulos garantizados ni a un límite de duración de5minutos de video. Hace falta medir un capítulo real en esa cuenta. Fuentes: https://cloudconvert.com/pricing y https://cloudconvert.com/apis/video-encoding .

Se preparó `tools/cloudconvert/job.example.json`: import/upload -> convert MP4x264720p -> export/url. Es un ejemplo revisable, no un adaptador ejecutable/productivo. La APIkey no está configurada; no se enviaron archivos ni jobs a CloudConvert desde el proyecto. No se habilitaron pagos, suscripciones ni recargas. Documentación operacional en `tools/cloudconvert/README.md`.

El resultado de CloudConvert tendría que recogerse antes de24h y guardarse por rclone en Drive privado. Las integraciones documentadas deGoogleCloudStorage son distintas deGoogleDrive personal: no confundirlas. Exportación oficial: https://cloudconvert.com/docs/import-export/export-files .

Mientras tanto la tablet sigue el job2. La fuenteAV1 1080p dura1420.096segundos y ocupa125635937bytes. El MP4 derivadoH264720p ya supera325MB mientras se escribe; esto demuestra por qué no debe recodificarse para ahorrar espacio sin comparar los resultados. El original ya está archivado y verificado en Drive. La API de catálogo local continúa200 durante la conversión.

Pendiente para automatización CloudConvert: clave backend privada, política de uso solo de cuota gratuita validada en la cuenta, estados persistentes por job_id remoto, descarga verificada y control para evitar duplicar el trabajo con la tablet. No sustituir el originalAV1 ni considerar el proveedor habilitado hasta completar un piloto.
