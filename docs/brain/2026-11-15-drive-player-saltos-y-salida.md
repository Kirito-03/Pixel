# Reproductor de Drive: saltos y salida Android — 15 nov 2026

## Solicitud y diagnóstico

- Captura del teléfono: título bajo en paisaje, falta de saltos de10/15segundos y pantalla gris al salir con la flecha superior izquierda (confirmado por el usuario).
- Teléfono real conectado: Samsung SM-A155M, instalación original1.0.7/código8. Registro reciente del proceso sin excepción fatal; no se capturaron ni publicaron registros de otras apps.
- NativeVideoPlayer tenía paddingTop44 y botones centrales de capítulo anterior/siguiente, que no son saltos de tiempo.
- Android intercambiaba dos Modal en el mismo render mientras se restauraba orientación. Agy revisó en modo plan/solo lectura y confirmó esa transición problemática y el efecto autoplaying que se autocancelaba/repetía. No se pidieron credenciales ni edición al agente.

## Implementación

- PlaybackChrome compartido también para video directo: título arriba, subtítulo y navegación entre capítulos separados de los controles de transporte. Se elimina padding44 del encabezado anterior.
- SeekButton explícito Retroceder10segundos / Avanzar10segundos, alrededor de pausa en Android. En video directo web también aparecen los dos botones, conservando los controles nativos del video.
- Saltos limitados a0..duración; conservan el estado pausado y guardan la posición conocida al instante. El segundo0 deliberado se admite y resuelve el mismo episodio al continuar, sin reiniciar la serie desde el primer capítulo.
- Al cerrar, anterior o siguiente capítulo, el video nativo se pausa después de capturar su posición.
- Android conserva una sola ventana Modal opaca tanto en detalle como al reproducir. Solo intercambia su contenido; la flecha y el Atrás del sistema vuelven al detalle. El controlador de barras de sistema permanece acotado al reproductor y la orientación se restaura con la cola existente.
- Apertura desde Mi lista consumida una vez por solicitud; no se usa autoplaying como dependencia del mismo efecto. Las comprobaciones de red pendientes no pueden reabrir un reproductor después de cerrar/cambiar el contenido.
- Se encontró en el episodio real496 (Chitose, cap11) stream propio y cinco proveedores alternativos. El selector anterior podía priorizar un iframe sobre el archivo de Drive. El archivo directo/local/stream gestionado tiene ahora prioridad en web y Android; solo se usa iframe para fuentes que lo requieren.

## Verificación

- Suite95 pruebas Node pasada, más revisión específica final de fuentes y controles. Cubren salida a detalle sin otro Modal Android, apertura desde Mi lista con promesa pendiente, no reapertura tras salir, saltos hacia0/final, conservar pausa, progreso0 del mismo episodio y prioridad de Drive frente a embeds.
- TypeScript sin errores nuevos en los archivos de esta tarea; persisten8 anteriores de Loader, useProfileManagement, AiringScreen y offlineDownloads.
- Petición Range real bytes0-1 al stream propio del episodio496:206, Content-Type video/mp4, Content-Length2, Content-Range bytes0-1/83618698. No se descargó el video completo para probar el servidor.
-1.0.8/código9 fue compilada, publicada con SHA/firma validadas e instalada por adb install -r en el teléfono sin borrar datos. dumpsys confirmó1.0.8/9. Después de publicar se detectó la prioridad de Drive frente a proveedores; se prepara1.0.9/código10 para incluir esa corrección, sin reutilizar código9.
- La prueba visual de salida en el teléfono requiere que el usuario abra y cierre el episodio. Se solicitó al usuario; no se afirma que la pantalla gris esté reproducida/resuelta en el dispositivo solo por instalar.

## Alcance

- No se cambian códec, transcodificación ni archivos de Drive. Los controles actúan sobre el reproductor del archivo directo.
- Archivos ajenos no incluidos: dist/index.html ya modificado y tools/pixel-drive-ingest.mjs creado concurrentemente durante esta tarea. No se editaron ni se agregaron al commit de este cambio.

## Publicación final

- APK1.0.9/código10 compilada con límites en2m17s;124235714bytes, SHA2569ef7ee1606905122d95e08959a1dd978b61c9b762031ec0a1b81e3be4c613a72. Certificado comprobado contra las instalaciones anteriores. Binario subido con nombre temporal, checksum remoto validado, manifiesto publicado al final. Manifiesto1.0.8 guardado antes del cambio.
- Instalada con adb install -r en el Samsung conectado. Resultado Success y dumpsys confirmó versionName1.0.9/versionCode10. No se usaron borrado de datos ni concesiones adicionales de permisos.
- Manifiesto público y descarga por rango?build=10 comprobados contra versión/tamaño/SHA y cabecera ZIP. Se exportó y publicó web mediante staging, conservando chunks anteriores; HTML público idéntico a la exportación final. Backend/túnel/DNS sin cambios.
- El aviso al usuario para probar la salida sigue pendiente de respuesta; instalar y compilar no equivalen a una comprobación visual del fallo en su teléfono.

## Comprobación real en navegador

- Se abrió Chitose-kun wa Ramune Bin no Naka Part2, episodio11, desde su tarjeta Continuar viendo. Se confirmó elemento video directo (sin iframe) aun teniendo5 proveedores en el catálogo.
- Video pausado con duración1420.096s y readyState4, sin error. Avanzar10 llevó85.425954→95.425954; Retroceder10 devolvió85.425954. Se mantuvo paused=true y se dejó en la posición original de la prueba antes de salir.
- La flecha volvió al detalle del anime en web. Captura real de los controles: outputs/pixel-drive-player-109.png del directorio de trabajo del chat. La comprobación web no sustituye la pendiente en Android físico sobre la pantalla gris.
