# Noticias compactas en Android — 15 de noviembre de 2026

## Implementado

- Componente AndroidNewsFeed específico de Android, conectado desde NewsScreen por Platform.OS. Las vistas existentes de las demás plataformas conservan su diseño.
- Cabecera Noticias compacta, filtros horizontales fijos arriba y feed con FlatList. Sin título gigante ni bloque de tendencias repetido al final.
- Destacada horizontal de144px mínimos, frente a380px de imagen anteriores. Miniatura100×112, título3líneas y fecha, sin párrafo adicional.
- Filas con miniatura86×76, categoría, fecha corta y título de hasta3líneas. Altura mínima104px; crece si se necesita por tamaño de letra. Sin sombras/bordes gruesos. Fallback de imagen y textos de accesibilidad.
- Una columna en teléfono; dos a partir de720px de ancho real, con máximo1120px del contenido y cálculo que evita estirar la última tarjeta de tablet.
- Carga Android simplificada: lista y destacada en paralelo; en categorías solo se pide la lista. No se mezclan destacadas/tendencias de categorías distintas ni se repite el artículo destacado en el feed. Las solicitudes tardías siguen descartándose con cancelled.
- Se mantiene abrir el enlace externo HTTP(S) o el detalle interno según el artículo; fallos de apertura muestran aviso.

## Validación

- Revisión visual con ReactNativeWeb de la misma presentación, usando noticias públicas reales. Vistas320px/tema claro,390px/tema oscuro y800px/tablet.
- Medidas observadas: tarjetas104px de alto,288px de ancho en320;358px en390. En800 dos columnas376px, posicionesx16/x408. Miniaturas cargadas y sin desbordamiento en teléfono.
- La vista previa es renderizado estático: las imágenes se representan con img para mostrar el diseño sin hidratación; no verifica la interacción ni es una captura del Samsung.
- TypeScript no añade errores en NewsScreen/AndroidNewsFeed. Permanecen los errores ya registrados de Loader, useProfileManagement, AiringScreen y offlineDownloads.
- Build release mediante npm run build:android con límites de CPU/memoria: BUILD SUCCESSFUL en2m21s. No se abrió el emulador. Falta comprobación visual/interactiva de esta pantalla en el teléfono físico tras actualizar.

## Publicación

- APK1.0.6/código7;124237402bytes. SHA256 f4df02b9899c517d796281b3c22ac9a4ee3de00b45e2eee3ecff5c92bc45de1c. Certificado de firma comprobado contra la huella de las APK anteriores.
- Binario subido con nombre temporal, checksum remoto validado y renombrado antes de sustituir latest.json. Manifiesto previo guardado en ~/server/backups/android-manifest-before-1.0.6.json. No se modificaron backend ni dist públicos para este cambio específico de Android.
- Manifiesto https://pixelnosekai.com/api/app-release/android anuncia1.0.6/7 y la descarga https://pixelnosekai.com/api/app-release/android/download?build=7 está disponible. Verificación HTTP por rango registrada al publicar.
- Vista previa local: outputs/pixel-noticias-android-compacto.png en el directorio de trabajo del chat. Notas guardadas en el proyecto; no se afirma sincronización con la bóveda externa desmontada.
