# Cierre nativo, barra de reproducción y sincronización — 15 nov 2026

## Hallazgo real

- El usuario confirmó que la pantalla gris persistía al seleccionar capítulo anterior y al pulsar la flecha para salir. La hipótesis de rotación/Modal por sí sola no solucionó el problema.
- Registro del proceso Pixel del Samsung conectado: ERR_USING_RELEASED_SHARED_OBJECT; «Cannot use shared object that was already released». Stack en NativeVideoPlayer dentro de commitHookEffectListUnmount. Después, ReactHost destruye la instancia y deja la Activity sin interfaz.
- Se comprobó en el SDK instalado que useReleasingSharedObject libera VideoPlayer en su cleanup antes del cleanup de progreso del componente. Este último leía player.currentTime/duration ya liberados. Agy confirmó el orden y recomendó guardar una copia en JS sin getters nativos al desmontar.

## Cambios

- Cleanup de progreso usa exclusivamente lastValidSnapshot; lectura de posición solo en reproducción, pausa, búsqueda y salida explícita, antes de liberar. Se marca el componente como desmontado antes de la liberación de Expo para descartar eventos tardíos.
- La clave de NativeVideoPlayer incluye perfil/anime/episodio/URL. El contenedor espera a cargar fuentes del episodio correspondiente para no montar un archivo anterior con metadatos nuevos.
- PlaybackTimeline: tocar/arrastrar hasta cualquier segundo; previsualización del minuto sin disparar una petición de seek por cada movimiento, un seek al soltar y cancelación sin seek. Duración/posición visibles, acciones accesibles−/+10s. Mantiene estado de pausa y guarda el punto elegido.
- Se conserva la ventana única Android y los botones−/+10s de1.0.9.

## Sincronización

- Mi lista ya usa Firestore por uid y perfil, y progreso de anime usa profiles/{uid}/profiles/{profileId}/watch_progress. Los videos de Drive se reproducen como archivos directos y permiten guardar segundos/duración. Mi lista carga ese historial, muestra Continuar viendo y resuelve episodio/minuto al abrir. Al cerrar el detalle se recarga la lista. Requiere misma cuenta y mismo perfil entre dispositivos; no hay transcodificación ni almacenamiento del progreso dentro del archivo Drive.
- Se verificó que el historial de búsquedas estaba exclusivamente en AsyncStorage por perfil. El usuario autorizó expresamente sincronizarlo.
- searchHistoryStore guarda cinco consultas únicas por perfil en el campo search_history del documento de cuenta profiles/{uid}, ya limitado al propietario por las reglas publicadas. No se modifican reglas ni se amplían permisos. Operaciones transaccionales evitan perder consultas concurrentes; onSnapshot actualiza clientes abiertos.
- Migración local una sola vez al crear la entrada del perfil; un borrado deja una entrada vacía para que un dispositivo antiguo no resucite búsquedas borradas. Cambiar cuenta o perfil cancela la suscripción y descarta callbacks viejos; se valida el uid esperado tras restaurar auth. Fallos de sincronización aparecen como aviso; no se informa éxito silencioso.

## Validación

-103 pruebas Node: regresión que hace lanzar los getters del reproductor liberado durante unmount, snapshot conservado sin excepción, seek a minuto concreto manteniendo pausa, gestos de barra y cancelación, dos clientes de historial sincronizados, aislamiento cuenta/perfil, borrado y migración sin resurrección, auth cambiada/rechazada.
- TypeScript sin errores nuevos; siguen los8 errores anteriores en Loader, useProfileManagement, AiringScreen y offlineDownloads.
- Pendientes al preparar publicación: compilar/publicar/instalar1.0.10 y repetir prueba real de salida/capítulo anterior con el usuario. La reproducción web anterior de Drive no valida el ciclo de vida del objeto nativo.

## Publicación1.0.10

- APK1.0.10/código11 compilada con límites en2m40s;124243470bytes; SHA256ae74223135accbff3fd284b70106e284eb0c55ee8bbc36d4592bd6c4447c9bc2. Firma comprobada contra la huella de continuidad. Subida temporal con hash remoto comprobado; manifiesto sustituido al final y el anterior respaldado.
- Instalada por adb install -r sin borrar datos. Success y dumpsys confirmó1.0.10/11 en el Samsung conectado. Se pidió al usuario repetir capítulo anterior y flecha de salida y probar la barra, sin afirmar todavía éxito visual en su teléfono.
- Web exportada y desplegada mediante staging, conservando chunks anteriores. HTML público coincide con la exportación; manifiesto de APK y descarga por rango con cabecera ZIP verificados. No se cambiaron backend, túnel, DNS ni reglas de Firestore.

## Cierre y confirmación

- Usuario confirmó en el teléfono con1.0.10: «Sí, ya funciona sin pantalla gris», tras pedirle probar anterior y la flecha de salida. La corrección del ciclo de vida nativo queda confirmada por el usuario.
- Historial web real: una consulta ya existente (Mikadono) pasó al primer lugar mediante Enter y apareció en Últimas búsquedas recibido por onSnapshot, sin error de permisos. Se reenvió Chitose para devolver el orden anterior. El historial se conserva en el documento de cuenta, no en AsyncStorage salvo durante la migración inicial.
- La prueba de dos clientes y aislamiento se ejecutó en tests con Firestore simulado; no se afirma una prueba manual Android↔web del historial por parte del usuario. Una segunda pestaña de revisión carecía de perfil seleccionado; se mantuvo la condición de misma cuenta/perfil y no se crearon perfiles de prueba.
