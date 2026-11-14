# Buscador y confirmación de Mi Lista

Fecha: 2026-11-13

- Se retira el contorno blanco del botón de búsqueda y de los campos de búsqueda web. El botón mantiene una señal de foco discreta mediante color de fondo.
- Mi Lista muestra indicador de actividad durante la petición y check solo después de confirmarse. Compartido por tarjetas y fichas; bloquea operaciones simultáneas del mismo título. Los fallos no producen un favorito ficticio.
- Los cambios pendientes y las respuestas de lectura están ligados a usuario/perfil/preferencia +18; una respuesta antigua no altera el perfil nuevo ni sobrescribe una escritura completada.
- Firebase espera authStateReady antes de leer el perfil al restaurar sesión.
- H tiene botones de Mi Lista en tarjeta y ficha. Se guarda con tipo h_anime y slug, independiente de anime/manga. Mi Lista muestra estas entradas únicamente con +18 habilitado y permite abrirlas en su propia sección y retirarlas con su tipo correcto.
- getMyList excluye H por defecto y no consulta sus metadatos hasta recibir includeAdult:true. Inicio y búsqueda universal también excluyen la etiqueta h_anime.
- La caída del endpoint Continuar viendo deja de impedir cargar favoritos.
- Firestore: mismo acceso exclusivo al dueño, se admite h_anime como identificador de texto dentro de mylist; no se añaden campos de metadata ni permisos públicos.
- Verificación: 38 pruebas Node pasan, incluida confirmación retrasada, deduplicación de escrituras, fallo, cambio de perfil, lectura tardía, restauración de autenticación y CRUD H aislado. Expo web exportado correctamente; TypeScript global conserva errores previos fuera de los archivos cambiados.
- Revisión visual aislada con títulos y portadas neutros: carga, check, sincronización tarjeta/ficha, retirada y outline:none/0px del botón de búsqueda. Las capturas son datos de prueba, no contenido real ni una prueba nativa Android.
- Frontend desplegado en dist de Termux, con copia previa en ~/server/backups. No hay migración SQL ni cambios de backend.
