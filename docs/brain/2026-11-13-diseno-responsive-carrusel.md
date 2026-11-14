# Revisión visual y carrusel — 13 noviembre 2026

## Alcance y evidencia

Se inspeccionó en el navegador abierto el sitio real autenticado:Inicio,Noticias,Emisión,Manga,MiLista y una ficha de anime. Se revisó tamaño escritorio1543px y móvil390x844. Se revisó código con agy-cli para comportamiento responsive y administración. No se ha ejecutado la appAndroid nativa: la laptop tieneADB yKVM accesible, pero no se encontró AndroidEmulator/SDK/AVD configurado ni dispositivosADB conectados. Vistaestrecha web no equivale a pruebaAndroid.

## Correcciones de código

- MovieRow:webScrollView vuelve a ser un contenedor horizontal desplazable; APIReactNative.scrollTo({x,animated}) en vez de enviar left/behavior a una referencia que no garantiza la API nativa del navegador. Flechas con nombresaccesibles, límite de desplazamiento y visibilidad según tamaño real del contenido.
- HoverLayer.web usaReactDOM.createPortal en document.body. La ampliación queda fuera del recorte del carrusel; ubicación medida, margen para las flechas, cierre diferido120ms al pasar desde tarjeta al popup, cancelación al desplazar/redimensionar/Escape, cierre al abrir ficha y limpieza de temporizadores. Nohover en pantallas pequeñas; versiónnativa sin dependencia deReactDOM.
- MovieRow pasa el mismo ancho a las tarjetas para alinear cálculo de desplazamiento y diseño móvil.
- EtiquetaENEMISIÓN reemplazaNUEVOEPISODIO cuando solo se conoce el estado de emisión; no afirmar un estreno sin datos.
- Reintentos de poster reducidos20→2, con deduplicación y cancelación al desmontar.
- MangaScreen: columnas progresivas según ancho útil (mínimo2,máximo8) en lugar de pasar2→8 a768px.
- AiringScreen: permite2columnas en móviles<420px.

ExportaciónwebExpo completada; desplegada en la tablet con respaldo previo de dist en ~/server/backups/pixel-dist-before-carousel-fix.tgz. La comprobaciónTypeScriptglobal mantiene errores preexistentes en reproductor,AiringScreen y otros módulos; no se afirma que el repositorio entero pase tipado. El adaptadorHoverLayer y componentesdelcarrusel no aparecieron con errores en la comprobación final previa a los últimos ajustesmenores de eventos.

## Revisión por sección y cambios recomendados pendientes

| Sección | Hallazgo y propuesta |
|---|---|
| Inicio | Heroocupa casi toda la primera pantalla y rota aunque se navegue a otras pestañas; limitar altura, pausar al perder foco, traducir sinopsis/géneros y priorizarContinuarviendo/Últimoscapítulos/Descubrir. Títulos identificables sinhover y filas sincontenido ocultas. El estado emisión no garantiza capítulos disponibles. |
| Noticias | Buenhero, filtros y jerarquía; muchoespacio de cabecera y carga que sustituye bloques completos. Mantener contenido previo durante actualización, skeletons de tamañoestable, filtros en una solabarra, fecha yfuente claras. Se observaron tendenciasmock durante carga que luego cambian a noticiasreales: eliminar afirmaciones ficticias del fallback. |
| Emisión | Antes3tarjetas en teléfonosestrechos: ahora2. La etiquetaHOY deVerdisponibles incluye catálogo completo en emisión; diferenciar disponibles, próximos, horarios y calendarioexterno. EvitarSUB/N/A si no hay datos. Barradedías debe poder desplazarse sin desborde. |
| Manga | Cuadrícula gradual corregida; portadas faltantes y muchos contadores0capítulos que podrían significar no consultado. Distinguir desconocido/cargando/cero confirmado. Simplificar badgesduplicados y normalizar fechas. Pendiente corregir minWidth140 en celdasderelleno y comprobar lector con capítulosreales. |
| MiLista | Estado vacío móvil legible, pero falta botónExplorarcatálogo. Con contenido revisar tarjetas de última fila que se estiran y separación porAnime/Manga/Continuar. No se añadieron ni borraron favoritos durante la revisión. |
| Ficha | Se probó apertura desde tarjeta; sinopsis/trailer/español y disponibilidad deben concordar. EvitarReproducir para anime sin capítulos. Popup aún contiene13+/HD y botón+ no conectados a datos/acciones: pendientes de corrección. |
| Búsqueda | Overlay conserva contenido en árbol de accesibilidad aun cerrado; revisar ocultación/inert/foco yEscape. Traducir géneros y usar resultados desde catálogo con estados de carga/error. No se modificaron búsquedasguardadas. |
| Admin | Revisión de código: sidebar desaparece bajo980px y enAndroid sin alternativa. Añadir menúdentrodeAdminShell y unificar panelReact frente alHTMLantiguo. El cambio de carrusel no rediseña el admin. |

En webmóvil se observaron7entradas en barra inferior con etiquetas apretadas/truncadas. Propuesta:5accesos comoInicio/Explorar/Manga/MiLista/Perfil, conNoticias yEmisión dentro deExplorar o un menú claro. Validar esta distribución con el usuario antes de sustituir la navegación entera.

## Android y visualización

Equipo15GiBRAM, KVMlegible yADB disponible, pero sinAVD/emulador encontrado. PrepararAndroidStudio, SDK/BuildTools/Emulator e imagenAVD, activar un dispositivoPixel y ejecutar builddesarrolloExpo (`npx expo run:android`, luegoMetrodevelopmentclient). La app usa dependenciasnativas comoGoogleSignIn yMMKV; no asumir queExpoGo sustituye al builddesarrollo. El emulador abre una ventana propia; aquí se pueden compartir capturas de evidencia, pero el navegador390px es únicamente revisiónresponsive.

Fuentes oficiales consultadas:
https://docs.expo.dev/workflow/android-studio-emulator/
https://docs.expo.dev/develop/development-builds/use-development-builds/
https://developer.android.com/studio/run/emulator-acceleration

Antes de darAndroid por validado: navegación con botónAtrás,safeareas/teclado,gestos de filas,lectorManga,reproducciónAV1 y administración sin sidebar. Esos puntos siguen pendientes de dispositivo/emulador real.

## Resultado de prueba final en producción

Compilación web final exportada y desplegada. MediciónDOM del carruselDestacados: inicialmente0px; botónSiguiente→501px (máximo2044-1543), aparecióAnterior; botónAnterior→0px. Tras ambas acciones se abrió la tarjetaampliada con interacción real de puntero, visible sinrecorte ni impedir las flechas en los márgenes. Se guardó evidencia en outputs/pixel-carrusel-hover-corregido.jpg y vista390px en outputs/pixel-inicio-mobile.jpg. La ficha también se abrió desde el popup. La barra inferior de7opciones siguependiente de rediseño; no se presenta esa propuesta como un cambio ya aplicado.
