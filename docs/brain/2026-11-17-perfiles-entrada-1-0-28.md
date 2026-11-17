# Entrada y selección de perfiles — 1.0.28 (30)

Fecha: 2026-11-17. Extiende la implementación de temporadas, marcas de lectura y caché de [[2026-11-17-temporadas-leidos-cache-1-0-27]].

## Problema reportado y evidencia

El usuario reportó demora al entrar y toques sin respuesta al elegir perfil. El teléfono mostró la pantalla global de carga tras autenticarse. La selección hacía un getDoc adicional aunque acababa de obtener la lista de perfiles. AppNavigator bloqueaba toda la interfaz mientras AdminContext verificaba token y sesión administrativa contra el backend. Los pasos de esa verificación se observaron en el log, sin guardar correos ni tokens. No se demostró un fallo físico del táctil.

## Cambios

- El contenido normal y la selección dejan de depender de adminLoading. Las rutas administrativas solo se registran cuando la comprobación terminó, el resultado es positivo y el correo de la identidad administrativa coincide con la cuenta autenticada. Un resultado pendiente o de otra cuenta no habilita Admin.
- La lista confirmada por Firestore se reutiliza durante60 segundos, en memoria y cualificada por UID. Al pulsar un perfil de esa lista no se repite la consulta. Al cambiar de dueño no se reutiliza; crear, editar o borrar invalida esa caché. No se usa un snapshot de caché local para renovarla como si hubiera sido confirmado por el servidor.
- Las lecturas de perfiles tienen límite de10 segundos y mensaje para reintentar. La respuesta tardía de una operación que ya venció no selecciona un perfil. El contador de selección también descarta resultados anteriores después de limpiar/cambiar perfil.
- Al pulsar un perfil aparece indicador en la tarjeta y Abriendo perfil…; las pulsaciones duplicadas se ignoran mientras se verifica y se rehabilitan al fallar. El error se muestra en la pantalla, sin alerta modal en esa selección. El fondo decorativo ignora eventos táctiles.
- Se mantiene obligatorio tener sesión y perfil antes de acceder al contenido. La comprobación de administrador no se elude: continúa en paralelo y conserva la protección del servidor.

## Validación

- 215 pruebas Node aprobadas. Se probaron caché por dueño, ID del documento canónico, invalidación, vencimiento de espera, selección tardía descartada, doble toque/feedback/error, navegador principal mientras carga Admin y cierre de rutas Admin ante identidad distinta. MainTabs también se renderizó con esos estados.
- agy revisó el cambio de perfiles en modo solo lectura y no encontró bugs concretos en la revisión.
- TypeScript conserva únicamente los dos errores previos de offlineDownloads.ts:83 sobre documentDirectory/cacheDirectory.
- Exportación web limitada: 44 archivos verificados y publicación atómica; HTML público SHA25636ba42cdda2035c3a9ee4f8ca283ee38a3acc14746a5184cad9553764d7a68ca.
- APK compilada con wrapper limitado/JDK21: BUILD SUCCESSFUL en2m15s. Empaquetado comprueba firma fijada y zipalign16 KiB.
- APK1.0.28/código30,123641866 bytes; SHA25626b550d65648e515b935d87c320f90703323238625d623b9ea060259579c4506.
- Instalada con adb install -r --no-incremental: Success; mismo appId10414 y fecha original de instalación, sin desinstalar ni borrar datos.
- Comprobación real: el usuario abrió1.0.28 y confirmó «Entra al contenido» al tocar su perfil. Esto resuelve el bloqueo que había reportado durante la revisión.
- Manifiesto público1.0.28/código30 verificado con tamaño y SHA256 esperados. Descarga pública completa HTTP200:123641866 bytes en111.40 segundos, SHA256 idéntico al original firmado. La copia verificada en Descargas del teléfono también coincide. Web, publicación, actualización instalada y entrada física confirmadas.

## Publicaciones intermedias

1.0.27/código28 fue publicada e instalada durante esta tarea; su descarga completa se verificó. Código29 incorporó refresh=true al catálogo del servidor y fue instalado sin borrar datos. El problema adicional de perfiles reportado por el usuario se incorporó a1.0.28/código30 antes del cierre. No se atribuye a1.0.27 la corrección posterior de perfiles.

## Obsidian

MCP presente pero bóveda externa Reze sin montar: la nota queda guardada en docs/brain y pendiente de copiar, junto con1.0.26 y1.0.27.
