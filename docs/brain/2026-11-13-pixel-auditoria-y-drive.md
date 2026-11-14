# Pixel: dominio, catálogo, seguridad y almacenamiento

Fecha: 13 de noviembre de 2026 (America/Lima).

## Confirmado

- El usuario compró pixelnosekai.com; los otros dominios continúan separados.
- Cloudflare Tunnel vps-kvm-tunnel publica el .com hacia http://vns_frontend:8081, igual que la ruta anterior .art. Esto difiere del docker-compose local, que define pixel_frontend y pixel_backend. No cambiar el destino a ciegas.
- Certificado Universal de Cloudflare activo. Always Use HTTPS estaba desactivado; se activó y entrar por HTTP ahora redirige a HTTPS.
- La web carga y permite llegar a Inicio, pero la consulta pública GET https://pixelnosekai.com/api/catalog/anime?limit=1 devuelve 502 Host Error. El catálogo vacío en pantalla NO prueba que la BD esté vacía.
- El bundle desplegado observado es index-02b66d21f88213465a07f2861c37ffc4.js. La compilación local anterior no fue desplegada.
- El usuario tiene 5 TB de Drive personal; todavía no hay capítulos allí. Quiere importar fuentes que consigue, automatizar descarga, compresión, subida y registro.

## Cambios locales de esta revisión (sin despliegue)

- HomeScreen distingue error de conexión de catálogo vacío y permite reintentar.
- Eliminado el filtro por número <= cantidad de episodios que ocultaba numeraciones altas o con huecos.
- CatalogEpisode declara external_servers con el formato que usa la app.
- POST /transcode/hls exige authenticateAdmin y rechaza protocolos distintos de HTTP(S) y credenciales en URL. Esto no resuelve por sí solo SSRF desde fuentes de administradores, redirects, manifiestos HLS o trabajadores.
- /api/cors-proxy exige hostname exacto, HTTPS y puerto estándar; no sigue redirects y limita la respuesta a 5 MiB.
- /auth/forgot-password queda temporalmente deshabilitado con 503: antes entregaba el token al solicitante, sin verificar que controlase el correo. Reactivarlo requiere entrega por correo segura.
- /auth/reset-password valida longitud y guarda bcrypt, no texto plano. Pendiente consumo atómico del token, invalidar tokens anteriores al desplegar y revisar sesiones existentes.
- MCP pixel-brain creado por agy, revisado y probado por Codex, registrado en ambos clientes CLI. Solo notas .md dentro de docs/brain, sin acceso a .env. Abrir docs/brain como bóveda en Obsidian; no requiere API ni publicar el MCP en Internet. El chat actual no ha probado reconexión del cliente después del registro.

## Seguridad pendiente antes de ampliar importación

1. Reparar el 502 en el servidor: revisar Nginx del servicio real, upstream, puerto, salud del backend, redes Docker y logs. La bóveda identifica ssh arle (100.109.195.44:8022) y arle-lan (192.168.1.7:8022). Tailscale agotó el tiempo de conexión; LAN también agotó el tiempo de conexión. El servidor es Termux nativo, no el VPS Docker antiguo.
2. Subida /upload/avatar acepta anónimos y refleja x-client-baseurl; requiere autenticación compatible con los usuarios actuales, validación real de imagen y URL de salida controlada por servidor.
3. SESSION_SECRET no debe usar fallback conocido en producción; usar almacén de sesiones persistente y revisar cookies, CSRF y cadena real de proxies antes de cambiar trust proxy.
4. Encerrar ffmpeg en trabajador sin acceso a redes internas/metadata, con límites CPU/RAM/disco/tiempo. Validar y resolver cada origen; evitar redirecciones y recursos HLS a destinos privados. Solo listas de orígenes explícitas.
5. CORS no sustituye autenticación. Auditar recuperación, autorización por usuario/perfil, uploads y URLs firmadas antes de declarar el sistema seguro.

## Diseño propuesto para Drive (aún no implementado ni autorizado con Google)

Fuentes propias o autorizadas -> cola persistente -> descarga temporal -> ffprobe -> encode -> verificación -> Drive privado -> registrar file_id/checksum/tamaño/calidad -> copia de reproducción/caché -> publicación del capítulo como ready.

- No depender del enlace de origen después de una importación exitosa. Conservar su procedencia para trazabilidad y duplicados, sin guardar tokens o URLs firmadas en notas.
- Drive almacena archivo privado por file_id; el navegador no recibe credenciales Google ni enlaces compartidos públicos. OAuth de usuario para Drive personal con los menores permisos útiles y refresh token solo en servidor. Conexión pendiente del usuario.
- Drive tiene cuotas de API y descarga: 5 TB de capacidad no son ancho de banda ilimitado. Evitar usar un enlace de Drive como único origen público de streaming.
- Recomendación: Drive como archivo; R2 u otro almacenamiento/CDN apropiado para copias de reproducción populares. El código ya contiene integración R2 y cola de transcodificación, pero no un adaptador Drive funcional verificado.
- Cloudflare exige servicios adecuados para entregar vídeo/archivos grandes mediante su CDN. No planear todo el streaming por el túnel Free sin revisar esta condición y presupuesto.
- MVP: un capítulo de prueba, una tarea simultánea, estados queued/downloading/encoding/uploading/verifying/ready/error, reintentos limitados, cancelación, checksum y publicación solo después de verificar la subida.
- Reservar espacio temporal suficiente y borrar originales temporales solo tras confirmar integridad; no borrar archivos de origen automáticamente.

## Formato y tamaño

Punto de partida para probar calidad: MP4, H.264, 720p sin ampliar resoluciones menores, CRF 24–27, preset medium y AAC 96 kb/s; faststart para inicio progresivo. Subtítulos aparte en WebVTT cuando sea posible. H.265 o AV1 pueden reducir tamaño, con mayor costo de codificación y compatibilidad que hay que medir.

HLS facilita adaptación/reproducción; no comprime por sí mismo. El pipeline actual copia los MP4 sin recodificar, por lo que convertirlos a HLS no garantiza ahorro.

Ejemplo calculado, no promesa: 24 minutos a vídeo de 1–2 Mb/s más audio de 96 kb/s son aproximadamente 197–377 MB, sin contar pequeño overhead. CRF produce tamaño variable: medir 3 episodios representativos antes de elegir parámetros.

## Validación realizada

- 5 pruebas de rutas de seguridad con dependencias/BD simuladas: aprobadas.
- 12 pruebas MCP de protocolo y confinamiento: aprobadas.
- TypeScript sigue mostrando errores previos en otros componentes. Se corrigieron los errores external_servers de los componentes revisados.
- Falta prueba con servidor/BD real, un capítulo autorizado y OAuth de Drive. No se afirma que el sitio esté reparado en producción.

## Fuentes

- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/guides/limits
- https://developers.cloudflare.com/tunnel/concepts/routing/
- https://www.cloudflare.com/service-specific-terms-application-services/
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- https://learn.chatgpt.com/docs/extend/mcp?surface=cli

## Bóveda real de Obsidian

El usuario proporcionó `/run/media/arle/Reze/Users/ASUS/My Documents/Projects/`. Se encontró `.obsidian` y el índice `Pixel/00_PIXEL.md`. El MCP pixel-brain se reconfigura para limitarse a la subcarpeta Pixel de esa bóveda; no accede a otros proyectos ni notas de credenciales. Esta nota se conserva también en el repositorio como registro de la implementación.

Validación final: compilación web exportada correctamente a work/pixel-audit-web, sin desplegar. MCP probado con initialize y list_notes contra la carpeta Pixel de la bóveda real: correcto. Para continuar con el 502 hace falta restablecer SSH/sshd y conectividad hacia la tablet; no se accedió al servidor ni a su base de datos.
