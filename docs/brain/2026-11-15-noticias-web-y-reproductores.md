# Noticias web, fuentes y controles de reproducción — 15 nov 2026

## Implementado

- Noticias web: contenido máximo1240px, destacada horizontal310px en escritorio, tres columnas amplias sin marcos, filtros con subrayado y tarjetas compactas en web móvil. Cada noticia identifica medio/fecha y abre la fuente. Se conservan las tarjetas compactas específicas de Android.
- Se eliminó la mezcla de categorías y las tendencias de ejemplo de la pantalla. Lista y destacada se consultan en paralelo, con control de respuestas tardías y errores. Más noticias pagina24 resultados adicionales en web.
- El feed antiguo https://somoskudasai.com/feed/ devolvía HTML sin noticias. Se verificaron los feeds publicados en la cabecera del medio: /noticias/anime/feed/ y /noticias/feed/. También se verificó https://anmosugoi.com/feed/. RamenParados se conserva, aunque en la prueba respondió con error; MisiónTokyo/feed devuelve404 y se retiró de los predeterminados.
- Importación RSS independiente por medio, timeout10s, fecha inválida no aborta el lote, NewsAPI fallida no descarta RSS exitoso. Sin RSS exitoso, no se registra actualización satisfactoria; reintento cada10min, actualización normal cada2h, sin solapar trabajos.
- Se conservan noticias en PostgreSQL. Feeds de un mismo medio se deduplican antes de enriquecer. También se cubre la misma noticia con enlace canónico y enlace WordPress?p=: lectura prioriza imagen/calidad y la importación busca título+host exactos antes de insertar. No se eliminaron registros anteriores. Caché de destacadas5min.
- PlaybackChrome compartido entre anime web, anime Android con proveedor incrustado y catálogo restringido. Título/episodio discretos, anterior/siguiente y selector desplegable arriba, menú con servidor seleccionado. Sin fila inferior ni CTA rojo. El proveedor mantiene sus controles de reproducción. Controles de la app se ocultan automáticamente.
- La tarjeta que decía Próximo episodio siempre seleccionaba seasons[0].episodes[0]. Ahora muestra y reproduce el destino real guardado (temporada, capítulo y minuto), con etiqueta Ver episodio/Continuar viendo. Si la serie no tiene destino pendiente no anuncia un episodio1 como siguiente.
- Android: fuentes de proveedores disponibles aunque falte episode.url, parseo de JSON y preferencia por archivo descargado cuando existe. Wrapper comprueba el enlace real en lugar de una cadena vacía.

## Verificación

- Revisión de agy en modo plan/solo lectura: confirmó aislamiento de feeds, fechas inválidas, fallback NewsAPI y fallos del scheduler. Registro del chat: work/agy-news-review.txt. No se le solicitaron credenciales ni cambios de archivos.
-87 pruebas Node pasan, incluidas progreso, pausa, navegación, fuentes, selector compartido y RSS con un medio fallido/fecha malformada. TypeScript no añade errores en archivos modificados; siguen8 errores anteriores en Loader, useProfileManagement, AiringScreen y offlineDownloads.
- Importación real en tablet:60 entradas RSS brutas,18 insertadas. API pública:54 noticias únicas visibles, tres medios; sin títulos repetidos entre las primeras50. Se conserva la diferencia entre total de registros y total visible deduplicado.
- Navegador real: filtro tráiler mostró solo2 artículos de esa categoría. Más noticias amplió enlaces de24 a48. Diseño sin marcos comprobado en escritorio.
- En Mikadono se pulsó Ver ahora del detalle: abrió episodio1. Selector cambió Voe a MP4Upload; Siguiente abrió episodio2 y al volver al detalle la tarjeta mostró episodio2. Se devolvió la prueba al episodio1. Esta prueba confirma navegación/marcador, no reproducción completa ni avance de minutos de un iframe externo.
- Voe mostró «Sandbox no permitido» al cargar su iframe. No se retiró el sandbox ni se afirmaron minutos de reproducción que no se pudieron medir. La disponibilidad de cada proveedor sigue siendo externa. No se verificó reproducción completa en MP4Upload ni catálogo restringido con contenido real.
- Compilaciones con tools/build-limited.mjs; sin emulador simultáneo. Web exportada y APK final BUILD SUCCESSFUL en1m27s. Tras corregir las fuentes Android se repitió únicamente la compilación necesaria y se exportó web otra vez para publicar los mismos fuentes.

## Publicación

- Backend respaldado en ~/server/backups/news-before-107-*.tar.gz antes de modificar. Se verificaron los hashes de los tres archivos con HEAD local previo. Solo se reinició pixel-backend; no se tocaron túnel, DNS ni trabajador de medios.
- Web publicada mediante staging y sustitución del directorio dist; se retuvieron chunks anteriores para sesiones abiertas. Copias dist-before-107-* en backups.
- APK1.0.7/código8,124234278bytes, SHA2560506fabca02816fe15bbd22076465c83828d9d5c67e40b889f58cdaff081b890. Firma comprobada contra la huella existente. Subida temporal, hash remoto y manifiesto publicado al final; copia del manifiesto previo android-manifest-before-1.0.7.json.
- Manifiesto público y descarga?build=8 verificados:206, application/vnd.android.package-archive y cabecera ZIP. Buscar actualización desde Perfil → Preferencias en el teléfono.
- Captura real Noticias: outputs/pixel-noticias-web-107.png del directorio de trabajo del chat. Notas guardadas en docs/brain del proyecto; no se afirma sincronización con una bóveda externa desmontada.

## Pendiente

- Comprobar en el Android físico selector, aspecto y continuación tras instalar1.0.7. No se ha usado el emulador en esta tarea.
- Resolver por separado la fiabilidad de reproducción de proveedores externos (Voe rechaza iframe con sandbox). El cambio de navegación no convierte sus enlaces en alojamiento propio.
