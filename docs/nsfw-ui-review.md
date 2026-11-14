# Revisión UI y Controles: Sección Adulta (+18)

## Alcance
Se revisaron y ajustaron exclusivamente los archivos de interfaz solicitados:
- `screens/NSFWScreen.tsx`
- `components/HentaiComponents.tsx`
- `components/HentaiSeriesModal.tsx`

No se modificaron navegación global, `MyListScreen`, preferencias/ajustes, backend, reglas ni fuentes de contenido.

## Ajuste visual solicitado: esquinas rectas y sin bordes

El commit de esta revisión se limita a esta sección: `NSFWScreen`, `HentaiCard`, `HentaiSeriesModal` y los estilos de `HentaiVideoPlayer`. Portadas, buscador, filtros, etiquetas, estados, acciones y filas de episodios usan radio0 y no tienen trazos decorativos. El filtro activo se distingue por fondo sólido y texto blanco. Se amplió la jerarquía del título y el espacio entre búsqueda y catálogo. La ficha conserva pantalla completa y contenido interior máximo1120px.

La exportación web se verificó y publicó. El backend de producción sigue devolviendo404 para `/api/nsfw/latest`; no hay tablas de esa sección en la base nueva. La cuadrícula poblada no se da por validada en producción. La pestaña adicional de QA pide seleccionar un perfil y no muestra perfiles disponibles; no se creó ninguno para esta comprobación.

---

## Hallazgos y Mejoras Implementadas

### 1. Guard `adultContentEnabled` y Ciclo de Perfil/Async
- **Problema anterior**:
  - `NSFWScreen.tsx` ejecutaba `nsfwApi.getLatest(...)` al montar sin verificar `adultContentEnabled`.
  - Al cambiar de perfil o desactivar `adultContentEnabled`, no se cerraban el modal de serie ni el reproductor (`HentaiVideoPlayer`), ni se invalidaban peticiones asíncronas en vuelo.
  - `HentaiSeriesModal.tsx` tampoco validaba `adultContentEnabled` ni descartaba respuestas tardías de `nsfwApi.getDetails`.
- **Corrección**:
  - `NSFWScreen.tsx` y `HentaiSeriesModal.tsx` consumen `useProfile()` (`adultContentEnabled`, `currentProfile`).
  - Si `adultContentEnabled` es `false`, **no se realiza ningún fetch** (`getLatest`, `getDetails`, `getServers`), nunca se habilita automáticamente y se muestra un estado bloqueado accesible con enlace a `Perfil`.
  - Al cambiar `currentProfile?.id` o desactivar `adultContentEnabled`, se incrementan referencias monotónicas (`catalogRequestIdRef`, `videoRequestIdRef`, `detailsRequestIdRef`) para descartar respuestas asíncronas antiguas, y se cierran inmediatamente el modal de detalles y el reproductor limpiando estado previo (`items`, `selectedAnime`, `playingServers`, `fetchingVideo`).

### 2. Alineación Max 1120px, Grid Responsive y Modal Pantalla Completa
- **Problema anterior**:
  - `NSFWScreen.tsx` calculaba columnas usando `window.innerWidth` estático en `StyleSheet.create` y sin límite de `1120px`, provocando demasiadas columnas en escritorio amplio y falta de reactividad al redimensionar.
  - `HentaiComponents.tsx` (`HentaiCard`) tenía `minWidth: 140` que podía desbordar cuadrículas estrechas en móvil, y mostraba un badge fijo `"Finalizado"` en todas las tarjetas sin respaldo en `NSFWAnime`.
  - `HentaiSeriesModal.tsx` se renderizaba como ventana flotante (`80% x 90%` en web / `95%` en móvil) usando `Dimensions.get('window')` y checks estáticos `Platform.OS === 'web'`, en lugar de pantalla completa con contenido acotado igual que `AnimeSeriesModal.tsx`.
- **Corrección**:
  - `NSFWScreen.tsx` centra el contenido en `maxWidth: 1120, width: '100%', alignSelf: 'center'` y calcula `numColumns` con `useWindowDimensions()` sobre el ancho efectivo acotado (`Math.min(width, 1120) - horizontalPadding * 2`).
  - `HentaiCard` elimina `minWidth: 140`, usa `colors` de `useTheme()`, muestra badge `18+` coherente, fallback visual ante error de imagen (reseteando `imageError` al cambiar `poster_path`) y props de accesibilidad (`accessibilityRole="button"`, `accessibilityLabel`).
  - `HentaiSeriesModal.tsx` usa modal a pantalla completa (`animationType="slide"`, `statusBarTranslucent`, `100%` ancho/alto) con contenedor interno acotado a `maxWidth: 1120, alignSelf: 'center'` y layout responsive vía `useWindowDimensions()`.

### 3. Estados (Carga / Error / Vacío / Reintentar) y Verificación de Controles
- **Estados cubiertos en `NSFWScreen.tsx`**:
  - **Bloqueado (`!adultContentEnabled`)**: mensaje informativo + botón `Ir a Perfil` (`navigateByLabel('Perfil')`).
  - **Carga**: `ActivityIndicator` + texto descriptivo; durante búsqueda de servidores (`fetchingVideo`), overlay no destructivo para no perder la posición del grid.
  - **Error**: tarjeta con ícono, mensaje y botón `Reintentar` (`loadContent()`). Error de servidores visible inline (`videoError`) además de `Alert.alert` en nativo.
  - **Vacío**: tarjeta con `Limpiar filtros` (cuando hay búsqueda o filtro activo) y `Reintentar`.
- **Estados cubiertos en `HentaiSeriesModal.tsx`**:
  - **Carga**: indicador en sinopsis y sección de episodios.
  - **Error**: banner con botón `Reintentar` (`fetchDetails`).
  - **Vacío**: mensaje claro cuando no hay episodios disponibles.
- **Verificación de botones con handler**:
  - `NSFWScreen.tsx`: `Header` (`onNavPress`, `onSearchPress`, `onProfilePress`), botón buscar, botón limpiar búsqueda, chips de filtro (`Todos`, `Nuevos caps`, `Finalizado`), tarjetas (`handleCardPress`), cerrar aviso de error, `Reintentar`, `Limpiar filtros`, `Ir a Perfil`.
  - `HentaiComponents.tsx`: `HentaiCard` (`onPress`).
  - `HentaiSeriesModal.tsx`: cerrar modal (`onClose`), botón hero `Reproducir Ep. X` (`onClose` + `onPlayEpisode`), `Reintentar` (`fetchDetails`), filas de episodio (`onClose` + `onPlayEpisode`).

---

## Validación Ejecutada

- **TypeScript (`npx tsc --noEmit`)**:
  - Se ejecutó `npx tsc --noEmit 2>&1 | grep -E "NSFWScreen|HentaiComponents|HentaiSeriesModal"` después de las ediciones finales.
  - Resultado: **0 errores** en `screens/NSFWScreen.tsx`, `components/HentaiComponents.tsx` y `components/HentaiSeriesModal.tsx`. (El proyecto presenta errores previos en otros módulos fuera del alcance de esta tarea).
- **Plataforma Android**:
  - No se realizó ejecución ni validación real en dispositivo o emulador Android; los ajustes de layout y controles se basan en análisis estático, `useWindowDimensions()`, `useSafeAreaInsets()` y typecheck.
