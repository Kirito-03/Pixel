# Revisión final de interfaz y publicación en Git — 13 noviembre 2026

## Cambios preparados

- H anime: tarjetas, campos, filtros, botones, ficha y controles con esquinas rectas y sin bordes decorativos. Ancho máximo1120px y cuadrícula adaptable. Los filtros activos se distinguen por relleno y texto, sin contorno. Carga, error, vacío y reintento accesibles.
- Fichas de anime a pantalla completa con contenido acotado; portadas verticales conservadas completas en escritorio, ampliación limitada y recorte superior controlado en móvil. Se impide que las vistas previas de Inicio aparezcan por encima de una ficha abierta.
- La preferencia adulta se inicializa desde almacenamiento del perfil y deja de leerse/escribirse como flag global de la cuenta. Es una preferencia local del dispositivo; la sincronización porperfil en la nube queda pendiente. La ruta canónica es `/h-anime`, con alias del enlace anterior `/Hentai`.
- La activación temporal para comprobar la sección fue autorizada por el usuario. Se observó el interruptor originalmente apagado, se activó para la prueba y se volvió a dejar apagado antes de esta publicación. No inferir la preferencia actual del usuario si la cambia después.
- MiLista: Firebase `mylist`, reglas de propietario publicadas, añadir/recargar/quitar manga comprobados. Compatibilidad de eliminación con IDsaleatorios de versiones antiguas. Mapa legado de prueba conservado sin usar.
- Portadas de manga: proxy con validación de imagen y límites; portada real visible. Lector con rutas de capítulos serializables y controles separados del Header. Páginas del proveedor probado devuelven403: lectura completa pendiente.
- Termux: servicios saludables, migración006 aplicada y recuperación PostgreSQL/Redislocal/PM2 preparada; falta prueba de reinicio físico. APKdebugx86_64 compilado correctamente,593tareas; falta prueba visual/login del APK en emulador conectado.

## Límite de la sección H anime

En la tablet se comprobó que `/api/nsfw/latest` devuelve404 y no existen las tablas `hentai_content` y `hentai_episodes`. El catálogo de esa sección todavía no está desplegado. La interfaz muestra el fallo y permite reintentar. No se crearon tablas ni se importó contenido como parte de este rediseño. No se rastreó el sitio externo propuesto.

## Validación

-32pruebasNode: seguridad, uploads, normalización de trailers, geometría de imágenes y lista porperfil.
-36pruebasPython de ingestión privada y12del MCP: correctas.
- ExportaciónExpoWeb correcta. TypeScript conserva errores previos en reproductor, descargas y otros módulos; se revisan por separado los archivos de esta entrega.
- Los archivos de credenciales, material audiovisual, cachés, artefactos Android y cambios de otros procesos se mantienen fuera del commit de esta revisión.

El estado operativo actualizado se conserva también en la bóveda de Obsidian del usuario, sin contraseñas ni tokens.
