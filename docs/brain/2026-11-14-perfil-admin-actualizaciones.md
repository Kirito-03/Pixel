# Perfil, administrador y avisos de APK — 2026-11-14

## Perfil y tema

- Una sola implementación ProfileScreen.shared para web y Android; selector Claro/Oscuro siempre visible, con sol/luna y etiqueta. No hay segunda pantalla para elegir el tema.
- Cuenta, Preferencias y Seguridad; acceso administrador directo solo para roles autorizados. Contenido acotado a 1160 px, formulario de 780 px, sin marcos anidados, filas que envuelven y controles de al menos 44 px. Menú compacto en móvil.
- Se retiraron cambios de nombre/email sin handler, contraseña ficticia para cuentas Google, pestañas de sesiones/dispositivos vacías, notificaciones que solo cambiaban un booleano y resumen duplicado de cuenta. Se conservan foto, cambio de perfil, preferencias +18 por perfil, verificación/restablecimiento de acceso cuando corresponde y cierre de sesión con confirmación.
- El tema se guarda como pixel.theme en AsyncStorage. La carga inicial no pisa una elección hecha antes de terminar la lectura. Navegación y fondo web reciben la paleta. Pruebas visuales de contraste centradas en Perfil; no equivalen a auditar el contraste de todas las fichas/reproductores de la app.

- También se corrigió el arranque en frío del perfil: loadCurrentProfile espera a Storage.ready antes de leer. La hidratación descarta valores antiguos si hubo escritura, borrado o limpieza mientras se cargaban; no resucita un perfil cerrado ni pisa uno recién elegido.
- Acceso administrador: se reutiliza la sesión ya verificada al abrir el panel y Firebase renueva tokens solo cuando el SDK lo necesita. Se retiró el registro del JWT/resultado completo en consola. En producción abrir el panel se comprobó con la cuenta autorizada y cargó sus cifras reales; el servidor sigue verificando permisos.

## Mi Lista

El botón manga intentaba navegar a MangaDetail desde la raíz de las pestañas, pero esa ruta pertenece a Manga. Corregido a navigate('Manga', { screen: 'MangaDetail', params: { id } }). Comprobado abriendo un favorito en una vista de prueba con la misma jerarquía anidada de navegación; se mostró su ficha.

## Administrador (colaboración agy-cli)

- Menú lateral 232 px en web y navegación inferior en móvil. Solo rutas reales: resumen, importar, catálogo, bot y alta de anime; capítulos se gestionan desde el título elegido.
- Se revisaron Dashboard, Importar web/nativo, Bot, catálogo, formulario de anime y gestor de episodios. Formularios acotados, menos marcos, esquinas discretas, objetivos táctiles y modales desplazables.
- Los cortes de columnas descuentan el ancho del sidebar: a 1000 px el contenido tiene 768 px y usa una columna; en escritorio amplio puede usar dos.
- Importar divide fuente M3U, configuración, resultados/selección y cola. Enlace a Smart Bot cuando se quiere buscar un anime por título. HLS/R2 heredado queda apagado por defecto para respetar la preferencia AV1 → Drive; no se cambió el codificador ni se lanzaron trabajos reales.
- Dashboard ya no presenta almacenamiento total como R2 ni una transcodificación ficticia en cero. Drive se cuenta según storage_type=gdrive; noticias solo se muestran si la API entrega ese dato. Fallos de carga visibles. Bot informa estado recibido/error en lugar de conexión inventada.
- Se preservan autenticación/roles/API de administración. Las importaciones, borrados, subidas y tareas masivas no se ejecutaron durante QA.

## Avisos de versiones Android

- Nueva APK 1.0.3, android.versionCode=4. Se usa expo-application para leer la versión nativa instalada; el aviso compara versionCode, no cadenas de texto ni la versión del bundle OTA.
- Se comprueba al abrir y al volver al primer plano después de 6 horas. Más tarde silencia esa compilación; una compilación posterior vuelve a avisar. Preferencias ofrece búsqueda manual y descarga. Sin conexión se muestra error y no se afirma estar actualizado.
- Servicio público GET /api/app-release/android, APK en /api/app-release/android/download?build=4. Manifest y APK fuera de Git en server/releases/android. Solo se expone el archivo de nombre validado, sin acceso general al directorio; versión obsoleta devuelve 409. Cliente acepta únicamente la URL HTTPS de Pixel prevista y metadata válida. Descarga requiere acción del usuario; Android confirma la instalación.
- La APK actualmente instalada debe sustituirse una vez por esta versión para tener el nuevo comprobador. No hay notificación del sistema mientras la app permanece cerrada.
- tools/android-release.mjs prepare sincroniza app.json con Gradle/runtime generados. package valida package ID, versión, código, firma, tamaño y SHA256; rechaza distinta APK con código reutilizado o certificado diferente. El pin público del certificado está en config/android-release-certificate.sha256; no contiene clave privada.
- Se mantuvo la firma existente para permitir actualizar las instalaciones anteriores. Es un certificado de desarrollo Android: antes de distribución amplia queda pendiente planificar una firma de producción y la transición de las instalaciones; no se rotó la clave durante esta tarea.

## Publicación y comprobaciones

- 66 pruebas Node pasan. TSC conserva errores previos en Loader, useProfileManagement, AiringScreen, LegalScreen y offlineDownloads; ninguno en los archivos nuevos/modificados de esta tarea.
- Expo web exportado y Gradle release exitoso. APK con versionName/código/paquete comprobados mediante aapt y firma comprobada con apksigner.
- QA con datos neutros: Perfil claro/oscuro, persistencia tras recarga y anchura 390 px; Mi Lista → manga; administrador móvil (resumen/importar/bot/catálogo/alta/episodios/modal) y escritorio de 1000 px sin desbordamiento horizontal. Se comprobó navegación, no mutaciones del catálogo.
- Prueba real final: seleccionado el perfil original, abrir /profile y recargar de nuevo conservó nombre/avatar; acceso administrador verificado previamente con sus cifras reales.
- Frontend público sirve index-26ac673a242b9404a7fcbadb5043115c.js. API de versión pública devuelve 1.0.3/4 y SHA correcta. Descarga real por rango devuelve HTTP206, MIME APK, filename correcto y 1024 bytes de muestra.
- Backend app.js coincidía con Git anterior; copia de seguridad, añadido únicamente router de releases y reinicio de pixel-backend. Dist tiene copia previa en ~/server/backups. Worker de medios sigue independiente.
- APK local: outputs/pixel-android-1.0.3.apk, 124201574 bytes, SHA256 45c09d4bb4a3861e463005f8120b8117fc40e568c0d4ec7def17e3dd794c32fc.
- Se aumentó versionCode con cada binario que llegó a publicarse; la publicación final es 1.0.3 (4).
- Aún falta probar la APK nueva en un Android físico. Las pruebas del aviso son con versión futura simulada en unit tests; no se publicó una versión falsa para forzar un aviso real.

Referencias: https://docs.expo.dev/versions/latest/sdk/application/ y https://docs.expo.dev/build-reference/app-versions/ .
