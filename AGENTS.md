# Pixel: trabajo y compilaciones locales

- Para compilar APK usa `npm run build:android` con `JAVA_HOME` apuntando a JDK 21. Para exportar web usa `npm run build:web -- --output-dir <destino>`. Ambos pasan por `tools/build-limited.mjs`: un trabajo, CPU y memoria limitadas mediante systemd. No sustituirlos por compilaciones sin límites en esta laptop.
- No ejecutar emulador, exportación web y compilación Android al mismo tiempo. Terminar la compilación antes de arrancar el emulador para probarla. Los tests de Node son ligeros y pueden ejecutarse aparte.
- Si falla una compilación por recursos, revisar el registro; no aumentar límites ni quitar las protecciones automáticamente. Conservar cachés y evitar `clean` innecesarios.
- Los archivos nativos de `android/` son generados e ignorados. Los cambios nativos duraderos viven en `plugins/` y sus config plugins. `withPlayerSystemBars` registra la vista del reproductor y configura Gradle para trabajo secuencial.
- No incluir secretos, archivos `.env`, configuraciones Google locales ni binarios APK en Git. Publicar la APK completa y comprobar SHA256 antes de reemplazar el manifiesto público.
- Registrar cambios y validaciones en `docs/brain/`, distinguiendo pruebas reales de pendientes.
