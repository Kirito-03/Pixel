# Android: tráiler, pausa e Inicio; Manga y favoritos antiguos

Fecha: 2026-11-14 (America/Lima)

## Alcance y resultado

Se mantuvo el rediseño pendiente de Mi Lista/Manga y se priorizaron las correcciones nuevas exclusivas de Android. agy-cli implementó catálogo y ficha Manga en sus tres archivos; Codex revisó esos cambios, añadió protección contra respuestas tardías de paginación y verificó la navegación.

- Inicio Android: los botones usan flexBasis:0/minWidth:0, texto adaptable y etiqueta corta Más info. La rama Android no modifica la distribución web.
- Ficha anime Android: hero con altura natural y contenido en flujo, sin desplazamiento vertical artificial; dos acciones principales más icono de tráiler en la misma fila. El tráiler ocupa un bloque 16:9, con Detener fuera del vídeo y espacio propio. Próximo episodio pierde su margen negativo solo en Android. El cierre respeta el área segura.
- TrailerPreview nativo: sin ampliar/recortar el iframe a 110/120 %. Se registra el reproductor IFrame de YouTube para mute/unmute y finalización. La variante .web no se modificó en esta tarea.
- Reproducción nativa: playingChange usa event.isPlaying para sincronizar botón e icono, controles visibles al pausar, VideoView textureView en Android y avance solamente con playToEnd. Se respeta resumeTimeSeconds al quedar listo el vídeo. Fuentes file:/content: locales se reproducen nativamente.
- Reproductores incrustados: la limpieza de anuncios deja de eliminar overlays genéricos del proveedor o interceptar sus controles normales. Puente de reproducción para vídeo HTML accesible (incluido iframe del mismo origen); el botón nativo de pausa solo se ofrece si ese vídeo es accesible. En iframes de origen distinto se conservan los controles del proveedor; no se afirma poder controlar cualquier proveedor desde fuera.

## Mi Lista y metadata

El ID 167152 devolvía 404 del catálogo SQL. Es un ID de AniList para Sentenced to Be a Hero. Se añadió caché PostgreSQL legacy_anime_metadata y la migración 007. Ante un ID no presente en SQL se resuelve metadata pública por ID exacto y se cachea 30 días (ausentes/adultos 6 h); timeout 12 s, peticiones simultáneas deduplicadas y límite de concurrencia. Las respuestas fallidas temporales no se guardan como ausencia. No se inventan capítulos ni se modifica el favorito de Firestore. El endpoint real devolvió HTTP 200 con título y portada en dos lecturas; se verificó fila válida persistida.

Mi Lista usa portadas verticales 2:3 más grandes: dos columnas en teléfono, tres/cuatro/cinco según pantalla y máximo de cinco; textos de dos líneas y eliminación táctil de 44 px. El ancho interno y las tarjetas se calculan sobre la misma columna.

## Manga

Catálogo acotado a 1200 px, portada 2:3, grilla de dos columnas en teléfono, búsqueda propia, chips de estado, paginación y errores con reintento. Populares se carga por separado una vez al montar. Se retiraron notas inventadas stableRating y el mes fijo abr. La ficha deja de usar una portada borrosa gigante como fondo; mantiene lectura, capítulos ES/EN, fallback inglés y guardado con carga/check.

## Validación y despliegue

- 49 pruebas Node pasan, con pausa/reanudación basada en eventos, ausencia de avance al pausar cerca del final, controles del proveedor, caché de metadata y exclusión de adultos.
- Expo web exportado; Gradle :app:assembleRelease exitoso en 2m05s. TypeScript conserva errores anteriores fuera de los archivos de esta tarea, sin errores nuevos en los editados.
- QA aislado con datos neutros: catálogo Manga en escritorio y 390px, búsqueda + estado, cargar 24 a 30 títulos, ficha, idioma EN y ruta correcta al lector. Mi Lista ampliada revisada en móvil. El diseño de botones Android se probó en una vista web de componentes con la condición de tamaño Android activada: Más info quedó entre x=199 y x=370 en 390px; esto no equivale a una prueba física de Android.
- No se controló un emulador/dispositivo nativo. Pausa, sonido y composición nativa necesitan validación final en el teléfono con la APK nueva.
- APK: outputs/pixel-android-2026-11-14.apk fuera del repositorio, 124195682 bytes. SHA256 65d6b9b493d2101dc3a3858bcca1cc97832793132927103b6bd02b9e7eb65b82.
- Backend: copia previa de catalog.js, migración 007 aplicada y PM2 pixel-backend reiniciado. Frontend: dist actualizado con copia previa en ~/server/backups. No se cambiaron permisos de Firebase.
