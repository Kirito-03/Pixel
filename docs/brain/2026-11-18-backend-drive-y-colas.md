# Backend detenido, Drive y propuesta de trabajadores

## Hallazgos reales

- Tablet accesible por SSH; PostgreSQL activo, PM2 sin procesos y puerto3001 cerrado. Se levantaron pixel-backend y pixel-media-worker mediante ~/server/start-pixel.sh. Catálogo público /api/manga?limit=2 y popular local respondieron200.
- runsv de rclone-drive no estaba activo; el puente127.0.0.1:8086 no respondía. CronDrive abortaba explícitamente sin modificar BD ante esa ausencia. Se inició el supervisor del servicio existente de solo lectura y se verificó HTTP200 en8086.
- Cola SQLite privada: dos trabajos ready; no había trabajos pendientes en esa cola. Es una cola distinta del recorrido de catálogo/ingesta de cron; no demuestra que todo el catálogo esté subido.
- Capítulo reportado: endpoint devolvió una página desde origen; petición directa a esa imagen desde tablet devolvió403 y el proxy local502. No se demostró que el archivo exista o sea accesible con la fuente actual. No se ha corregido ese archivo ni se afirma que ahora pueda leerse.
- Logs contienen errores previos de scraper «Unsupported platform: android». Separar trabajadores no arregla incompatibilidad de una fuente por sí solo.

## Recuperación

Nuevo tools/tablet-pixel-keepalive.sh, desplegado en ~/server/tools. Cada dos minutos, bajo flock, recupera solo los procesos Pixel ausentes/no online y el supervisor existente rclone-drive. Preserva los cron previos; no reinicia por una petición HTTP lenta, no borra datos ni cambia contenido de las colas. Requiere Termux/crond vivos: Android puede detener la aplicación y entonces no hay garantía de disponibilidad.

## Plan recomendado (pendiente de implementación)

Una cola persistente con tipos de trabajo y prioridades, no cinco bots que escriben independientemente al catálogo:

1. Descubrimiento en emisión: prioridad alta, revisa episodios nuevos, sin transcodificar ni subir.
2. Catálogo finalizado y temporadas: prioridad menor, sigue relaciones prequel/sequel e IDs externos. Registra temporadas ausentes1–4 aunque se descubra5; no renumera episodios ni inventa temporadas. Diferencia anunciado, disponible, incompleto y completo.
3. Metadatos: título/temporada/estado, sinopsis española persistida por hash y versión de fuente, imágenes/tráiler; no mezcla fichas por similitud de nombre.
4. Preparación: validar archivo, reutilizar AV1 compatible o remux sin recodificar; codificar solo si necesario, con un trabajo pesado a la vez en tablet. Codificación con pérdida no garantiza calidad idéntica.
5. Subida/verificación/publicación: subida reanudable, comprobar tamaño/hash cuando disponible y legibilidad; actualizar catálogo como listo solo después de verificar. Manga tiene carril independiente y conserva imágenes originales.

Estados propuestos: pending → downloading → processing → uploading → verifying → ready; retry_wait/failed explícitos. Clave única por fuente+serie+temporada+episodio+tipo, lease/heartbeat, checkpoints persistentes y recuperación de leases caducados. Reintentos limitados con backoff;403/404 no deben reintentarse eternamente sin revalidar metadatos. Fallos de un título no detienen toda la cola.

Panel: fase, archivo, bytes/total, velocidad, progreso, ETA solo cuando medible, último avance, error y siguiente reintento. Descubrimiento y metadatos usan contadores; ETA de codificación requiere progreso FFmpeg. No mostrar un porcentaje inventado.

Prioridad: disponibilidad y fuente fallida → cola unificada/checkpoints → temporadas relacionadas → panel y trabajadores separados. No se ha desplegado esta arquitectura todavía.
