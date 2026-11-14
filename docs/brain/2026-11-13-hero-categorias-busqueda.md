# Hero, categorías y búsqueda de la sección H

Fecha: 2026-11-13

- Solicitud actual: hero similar a Inicio y buscador propio de la sección, además de filtro por categoría. Sustituye la decisión anterior de retirar este buscador local.
- CatalogHero reutilizable: hasta cinco destacados, navegación con flechas e indicadores, rotación cada siete segundos; respeta movimiento reducido y pausa al pasar el puntero o salir de la aplicación. Abre la ficha existente con Más información.
- Banner panorámico cuando existe; si solo hay póster usa AnimeArtwork sin deformarlo ni ampliarlo excesivamente. La calidad final depende de los recursos guardados en el catálogo.
- Búsqueda local por título y categorías obtenidas de géneros reales, combinables con el estado. No generan peticiones adicionales al escribir. Actúan sobre el catálogo que devuelve el estado seleccionado; no son una búsqueda de otras fuentes.
- El hero se mantiene estable mientras se escribe o se cambia de categoría. Catálogo deduplicado y dividido en filas de doce sin truncar.
- Se conserva el bloqueo por perfil y la separación respecto a Inicio y la búsqueda universal de anime/manga.
- Verificación: exportación Expo web correcta; 33 pruebas Node pasan. Revisión visual aislada de componentes reales con 43 títulos neutros de prueba en escritorio y viewport 390 x 844; flechas, combinación de categoría y búsqueda, restablecimiento, apertura y cierre de ficha. No se modificó el perfil real. No equivale a una prueba en dispositivo Android.
- TypeScript global conserva errores previos fuera de los archivos cambiados; no se declara limpio todo el proyecto.
- Despliegue: frontend en dist de la tablet Termux, con copia previa en ~/server/backups. No requiere migraciones ni cambios de backend para estos controles.
