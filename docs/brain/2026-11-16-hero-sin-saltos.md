# Hero de Inicio sin saltos — 16 de noviembre de 2026

## Problema y causa
La fila En emisión subía/bajaba al cambiar de imagen. FeaturedMovie calculaba una altura diferente según artRatio; cada cambio reiniciaba la proporción a null y la volvía a establecer al resolver Image.getSize. Eso cambiaba dos veces la altura del hero y desplazaba el contenido inferior.

## Corrección
La altura del hero depende únicamente del ancho/breakpoint y alto de pantalla. Cada diapositiva ocupa el mismo espacio, incluso antes de recibir dimensiones de su imagen. AnimeArtwork conserva su ajuste de imagen dentro de ese marco. Se retiró la medición duplicada Image.getSize de FeaturedMovie. El cálculo móvil anterior se conserva.

## Validación y publicación
- 141 tests Node pasan. Exportación web limitada completada; sin compilación o emulador paralelo.
- Agy revisó el diff en solo lectura y confirmó la eliminación del doble cambio de altura. Señaló límites anteriores de fuentes grandes/pantallas bajas y el compromiso de encuadre de banners panorámicos: el arte conserva su tratamiento en AnimeArtwork, pero ya no cambia el tamaño de la sección.
- En navegador real, viewport1304×890: Romelia Senki y Sekai Saikyou mostraron En emisión en y722 tras cambios automáticos, sin diferencia vertical.
- HTML público SHA25622305483082645a1dab45512a539b9e4a1c3145cabbec6d83833fbe3d9a6a914, igual a la exportación local.
- Cambio publicado en la web. No se generó APK nueva: el ajuste afectado por las proporciones era la rama de escritorio y el cálculo móvil se conserva; la APK pública sigue1.0.17/código18.
- Captura de comprobación en outputs/pixel-hero-estable.jpg del espacio de trabajo de este chat.
