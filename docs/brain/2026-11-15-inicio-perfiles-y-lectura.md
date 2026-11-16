# Inicio, perfil y lectura — 15 de noviembre de 2026

## Requisitos y comportamiento final

- Inicio: hero de escritorio con altura adaptable entre620 y820px (82% del alto), menú sobre la imagen con fondo transparente en la parte superior y fondo oscuro al bajar. Se retira el desplazamiento de72px que dejaba vacío debajo del menú. Se conserva el límite de escala de banners1,35 y proporciones de la imagen: aumentar el área del hero no implica inventar detalle ni estirar el arte.
- Se detectaron cambios simultáneos en el repositorio, entre ellos un nuevo fondo negro incluso con black=false. El requisito más reciente del usuario es transparencia arriba; se restauró el extremo transparente de la animación del Header y se comprobó visualmente tras desplegar.
- Tipos de lectura: publication_type opcional persistido por el backend y etiquetas explícitas existentes para Manga, Manhwa, Manhua, Webtoon, One-shot o Novela ligera. Tipo interno manga sigue siendo la clave de rutas/favoritos. Si falta la clasificación, se muestra Lectura; no se infiere por título ni URL. Las tarjetas, hero, detalles y resultados usan el tipo conocido.
- Base comprobada:33 etiquetas Manga,4 Manhwa,8 Manhua y7 Webtoon; ninguna etiqueta Manga se solapa con las otras tres. No se asignó una nacionalidad por apariencia o por el texto de la sinopsis. Se limita el extractor de metadatos a la ficha, evitando recomendaciones/menús.
- Descripción de manga: cuatro líneas inicialmente, botón Ver más/Ver menos para textos largos, estado restablecido al cambiar de título. Comportamiento común para web y Android.
- Perfil: Términos/Privacidad en Preferencias; Administrador dentro de Cuenta en móvil y navegación lateral en escritorio. El pie conserva únicamente Cerrar sesión, también en Seguridad (sin duplicarlo dentro de la tarjeta).
- Selector de perfiles: cabecera adaptable con área segura y botón Salir de44px en móvil; no se superpone al logotipo. Se elimina la restauración automática del último perfil. Al entrar se exige elección explícita; un perfil vacío abre Crear perfil después de cargar correctamente, los errores muestran Reintentar. No se creó ni eliminó ningún perfil real durante esta revisión.
- Navegación: Principal no se registra hasta elegir perfil; la pantalla de selección se retira al elegirlo para impedir volver a quedar en ella. Cambiar de cuenta limpia la selección y la preferencia adulta en memoria; las preferencias por perfil se conservan en almacenamiento.
- Colisión /profiles: el API legacy protegido coincidía con la ruta web del selector y devolvía401 al recargar. Solo GET/HEAD de navegador con Accept:text/html, sin parámetros ni Authorization, redirige303 a la raíz pública de la SPA. La SPA determina login/selector. Los datos JSON, consultas con userId, solicitudes autenticadas y mutaciones siguen pasando por la autenticación original. No se devuelve información de perfiles ni se retiran cabeceras CSP para resolverlo.
- Login: retiradas las cifras10K+,4.9 yHD de web y móvil. Nueva animación común de nueve píxeles con acento verde grisáceo, sin spinner rojo; respeta movimiento reducido y detiene las animaciones al desmontarse. Integrada en carga general, acceso, perfiles e Inicio.

## Validación y despliegue

-109 pruebas Node pasan,0 fallos. Incluyen formatos reales/ausentes y aislamiento de la navegación HTML frente al API de perfiles.
- TypeScript conserva2 errores previos en offlineDownloads.ts (documentDirectory/cacheDirectory de Expo). Los2 errores de SharedValue desaparecen al sustituir Loader; se añadió validación de sesión al crear perfil, corrigiendo el userId opcional. No se cambió el módulo de descargas.
- Exportaciones web y Android mediante build-limited, secuenciales,2CPU/4GiB/512MiB swap, sin emulador. Se recompiló al detectar fallos de navegación y la capa oscura en QA; no se quitaron límites.
- Web publicada con staging y respaldo, conservando chunks previos. API /api/health OK. Código de backend modificado respaldado antes de actualizarlo y solo pixel-backend reiniciado.
- El usuario inició sesión en el navegador integrado. Se observó el selector y, tras corregir la navegación, kirito abrió Inicio y su barra de pestañas. Cabecera móvil comprobada a390px sin desbordamiento y con Salir separado del logotipo. Preferencias muestra los dos enlaces legales; Ver términos abrió el documento y Volver regresó al perfil.

## Android y pendientes

Se publicó1.0.12/código13 durante la revisión; la corrección final del menú usa un código mayor,1.0.13/14, sin reemplazar un binario publicado con el mismo código. La firma de continuidad se comprueba antes de publicar y el manifiesto se cambia al final, después de verificar SHA256 en el servidor.

El Samsung ya no está conectado a ADB (el intento a192.168.1.7:46561 devolvió No route to host). Solo se detectó la tablet iPlay_20P. No se instaló una actualización en un dispositivo diferente por suposición. La APK se ofrece por el comprobador de Pixel; la revisión visual nativa final sigue pendiente en el teléfono. El flujo sin perfiles se implementó sin crear/borrar perfiles reales para probarlo.

Notas en docs/brain, sin afirmar sincronización con una bóveda externa.

## Cierre verificado

- El navegador real mostró background rgba(0,0,0,0) en el menú a scroll0 y rgba(5,5,5,0.96) al bajar hasta976px. Hero y botones visibles en1440×900; capturas pixel-home-top-113.jpg y pixel-home-scrolled-113.jpg en outputs del chat.
- En El sentido absoluto de las espadas, Expandir descripción cambió a Contraer descripción y viceversa al pulsar. Se probó en390px; captura pixel-manga-description-phone-113.jpg. El dato de formato no existe para ese título y muestra Lectura, sin inventar Manhwa.
- /profiles con Accept:text/html respondió303 a la SPA, y con Accept:application/json respondió401; autenticación del API conservada.
- Web final1.0.13 desplegada con copia de seguridad. HTML público idéntico por SHA al exportado. La APK final1.0.13/código14 tiene firma de continuidad válida, SHA/tamaño del manifiesto público coincidentes, descarga parcial206 y firma ZIP PK0304. No se instaló en el Samsung al estar desconectado.
- APK123524594bytes, SHA256 `84b48d41c837fce86fe8a2c250fbc972e2e3d0ec8f0baa7a45b6d81999ad280a`. Publicación completa antes de cambiar latest.json.
