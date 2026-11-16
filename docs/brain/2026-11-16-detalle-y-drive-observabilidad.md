# Detalle de anime y visibilidad de Drive — 16 de noviembre de 2026

## Cambios implementados en la web
- Quitado el ScrollView interno de la sinopsis del hero que mostraba una barra pequeña. Resumen de tres líneas y texto completo mediante Leer sinopsis completa / Contraer sinopsis bajo la información.
- Hover de episodios con Pressable y estilos de React según hovered/pressed y el tema. Se eliminan las mutaciones DOM que dejaban un fondo distinto después de retirar el puntero.
- Panel Google Drive renombrado Archivos y tareas, con explicación de controles y alcance real de Iniciar lote mixto. Abrir archivo reproduce; Subir episodio solicita uno; Subir próximos limita la solicitud a pendientes de la serie.
- Consulta automática del inventario cada diez segundos mientras está abierto, sin solapamientos y descartando respuestas de consultas canceladas. Hora de consulta y aviso si falla la actualización.
- Se muestran también tareas finalizadas y fallidas del panel, sin equiparar salida exitosa del script a que todos sus archivos fueron guardados.
- Barras y porcentajes expresan capítulos de la serie ya terminados/guardados; no progreso en bytes del archivo en curso. Colores neutros para instrucciones legibles en el administrador claro.
- No se iniciaron nuevos lotes mediante el panel ni se reinició el backend o el bot durante esta revisión.

## Estado real observado en la tablet (instantánea, no estado permanente)
- Inventario del panel: 3 episodios de anime, 2 capítulos de manga y 2 episodios del catálogo restringido.
- Yamato yo Towa ni: REBEL3199 tenía episodios 1 y 2 en Drive; 2/26. Chitose tenía un episodio guardado, el 11.
- Logs de producción: el bot terminó la conversión del episodio 2 de Yamato, subió y verificó 108577781 bytes. El tramo desde inicio de compresión hasta subida verificada fue aproximadamente 37 minutos 20 segundos; es una medición histórica, no una estimación prometida para todos los capítulos.
- Al revisar procesos, había un FFmpeg y pixel-drive-ingest.mjs pertenecientes al directorio de Pixel. El siguiente archivo descargado figuraba con 146,9 MB.
- Desviación importante respecto a la preferencia AV1 del usuario: ese FFmpeg usaba libx264. El script automático legacy convierte fuentes grandes a H.264. No se modificó ni interrumpió una conversión en curso. Pendiente unificar la ingesta automática con la política AV1 acordada y evitar reintroducir otra copia/códec por el flujo legacy.

## Límites pendientes, sin inventar telemetría
- activeJobs del API solo registra trabajos manuales iniciados desde el panel y vive en memoria. No permite afirmar que el ciclo automático está parado si la lista está vacía.
- El backend actual no entrega bytes transferidos, velocidad ni ETA por archivo. La interfaz lo indica de forma explícita. Las barras por serie no sustituyen esos datos.
- Para seguimiento completo falta persistir tareas automáticas/manuales por archivo, fases (resolviendo, descargando, procesando, subiendo, verificando), marcas de tiempo/latido, métricas de FFmpeg/rclone y estimación solo cuando exista duración/tamaño y velocidad medidos; recuperación tras reinicio y errores legibles.
- No se añade un monitor engañoso basado solo en procesos vivos. No se reinicia el backend mientras tiene una ingesta en curso para activar telemetría nueva.
- Se detectó además que recargar directamente /admin/dashboard responde Cannot GET. Acceder mediante Perfil → Administrador funciona. Pendiente corregir el fallback HTML de esa ruta sin debilitar la autenticación de /api/admin.
- No se generó una nueva APK en esta revisión; los cambios están publicados en web y guardados en código compartido. No se afirma que ya estén instalados en el teléfono.

## Validación
- 122 pruebas Node aprobadas. TypeScript conserva los dos errores anteriores de offlineDownloads.ts (Expo FileSystem), sin errores nuevos.
- Exportación web con build-limited, límites de AGENTS.md conservados. Despliegue por staging con respaldo y chunks anteriores conservados.
- Agy CLI revisó el diff en modo plan/solo lectura y no encontró defectos accionables en los criterios de sinopsis, hover y polling honesto.
- Navegador autenticado: expandir/contraer muestra texto completo sin barra interna. Hover real de episodio en modo oscuro: fondo rgb(20,20,20) → rgb(28,28,30) al entrar; al salir recuperó rgb(20,20,20).
- Panel real: la hora de consulta avanzó sin pulsar actualizar (8:57:10 → 8:57:41, reloj mostrado en la sesión del navegador). No se utiliza ese reloj como zona horaria del servidor.
- Se restaura el modo claro original tras probar oscuro.

## Identidad del bundle web y caché
- En QA se confirmó que Expo reutilizó el nombre del archivo principal aunque cambió su mapa de chunks lazy del administrador. El navegador seguía cargando la pantalla anterior. Se añadió tools/finalize-web-export.mjs y su integración al final de build-limited para identificar la entrada por SHA-256 de sus bytes reales y actualizar la referencia HTML. La operación es idempotente y conserva el archivo anterior para referencias existentes.
- Prueba nueva comprueba que cambiar solo el mapa de chunks produce otra URL y que repetir la finalización no vuelve a cambiarla. Suite final: 123 pruebas aprobadas.
- Publicación web final: index SHA-256 f76be36e7a7b3b5c892a56189fa7975217c79c465b70d6d4899d50a0819ada0c. No es necesario borrar la caché del usuario para obtener esa entrada nueva.
