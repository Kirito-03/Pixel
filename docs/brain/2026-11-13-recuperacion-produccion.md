# Recuperación de producción — estado comprobado 13 noviembre 2026

La base del VPSanterior no estaba accesible; el usuario autorizó empezar de cero. Se inicializó PostgreSQL en la tablet arle, cluster `~/server/data/pixel-postgres`, base `bd_pixel`. Las migraciones001–006 están aplicadas y el backend responde200 con DBsaludable. Nginx8081 publica el frontend y deriva la API a3001.

Pixelbackend y mediaworker están administrados porPM2. Se añadió `tools/termux/start-pixel.sh` a Termux:Boot y se guardaron procesos con pm2save. Redisarranca en127.0.0.1 con protección activada. Pruebas de sintaxis y ejecución idempotente del script: correctas; falta reiniciofísico completo.

El pilotoDriveprivado ya se autorizó y archivó; no equivale a entrega pública ni a políticaAV1automática. El catálogo H anime sigue sin ruta/tablas en producción. Detalles y límites actuales en [[2026-11-13-cierre-diseno-git]].
