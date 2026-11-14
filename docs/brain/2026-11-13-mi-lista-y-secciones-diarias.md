# Mi Lista adaptable y cuatro secciones H

Fecha: 2026-11-13

## Mi Lista

- Columna centrada con ancho máximo de 1120 px; grilla de 1 columna en móvil, 2 desde 768 px y 3 desde 1120 px. Medidas calculadas para que la última tarjeta no se estire.
- Cabecera Tu colección, contador correcto de títulos guardados y filtros por Anime/Manga/H Anime (y vídeo si existe), con conteos y orden reciente/A–Z.
- Tarjetas con póster de mayor resolución, etiquetas por tipo, títulos de dos líneas, acciones accesibles de al menos 44 px y alternativa visual si la imagen falla. Las portadas internas /api/ usan la URL del backend para funcionar también en Android.
- Se retira el progreso 0 % inventado de los guardados que no tienen avance. Los estados vacío y error ofrecen explorar/reintentar.
- Se conserva Continuar viendo, la confirmación de retirada y los controles por usuario/perfil/+18.

## H

- Se retira Mi Lista de las tarjetas; permanece únicamente en el detalle.
- Vista normal: hasta cuatro filas de ocho títulos, sin repetirse entre filas: Recién actualizados, Selección del día, Series finalizadas y Para descubrir. Se omiten filas sin datos. El catálogo base no se recorta al seleccionar las filas.
- Buscar y filtrar cambia a una fila de Resultados. La búsqueda consulta el catálogo SQL con 350 ms de espera al escribir, usando el endpoint existente y su caché; así puede encontrar títulos fuera del lote reciente. La respuesta no altera el pool del hero. Respuestas obsoletas se descartan al cambiar consulta/perfil/estado.
- Hero: cinco destacados pseudoaleatorios determinados por fecha local e identificador. Mismos IDs + mismo día producen la misma selección aunque cambie el orden de la respuesta; otro día cambia. Se actualiza a medianoche o al volver a la aplicación, sin cron ni trabajo nuevo en la tablet. Altas/bajas del catálogo pueden afectar la selección del día.
- Un favorito H antiguo abre su detalle por slug aunque ya no esté en el lote reciente.

## Validación y publicación

- 42 pruebas Node pasan, incluida selección diaria, invariancia ante reordenamiento, cambio de fecha, filas limitadas, ausencia de duplicados y estado real de finalizado.
- Expo export web y Android/Hermes correctos. La revisión móvil se hizo en viewport de navegador de 320 y 390 px; no es una prueba en dispositivo/emulador nativo.
- QA aislado con portadas/títulos neutros: filtros, A–Z, eliminación con confirmación y contador actualizado; cuatro filas H; cero botones de guardado en tarjetas; guardado disponible en detalle; hero estable tras recargar; búsqueda y apertura de un título fuera del lote inicial.
- TypeScript global mantiene errores previos fuera del cambio; los archivos de esta tarea no reportan errores en la comprobación.
- Despliegue exclusivamente de dist en Termux, con copia anterior en ~/server/backups. Sin migración de base de datos ni cambio de reglas de Firebase.
