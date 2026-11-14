# Análisis del Proyecto: Pixel No Sekai

Este documento resume la estructura y las tecnologías clave utilizadas tanto en el Frontend como en el Backend del proyecto "Pixel No Sekai", basado en la revisión de los archivos de configuración (`package.json`) y la estructura de directorios.

## 📱 Frontend (Aplicación Móvil)

El Frontend está desarrollado como una aplicación móvil utilizando **React Native** y **Expo**.

### Tecnologías y Librerías Principales:
- **Framework:** React Native (`0.81.5`) con Expo (`~54.0.25`).
- **Lenguaje:** TypeScript (`~5.9.2`).
- **Navegación:** React Navigation (`@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`).
- **Almacenamiento Local:**
  - `@react-native-async-storage/async-storage`
  - `react-native-mmkv` (almacenamiento en caché ultrarrápido).
- **Autenticación:** Firebase (`firebase`), Google Sign-In (`@react-native-google-signin/google-signin`), y Expo Auth Session.
- **Reproducción de Video/Media:** `expo-video`, `hls.js`, y `react-native-webview`.
- **UI/UX:** Reanimated (`react-native-reanimated`), Expo Linear Gradient, Gesture Handler.

### Arquitectura de Carpetas:
La aplicación sigue una arquitectura típica de React Native / Expo:
- `/screens`: Contiene las vistas principales de la aplicación.
- `/components`: Componentes de interfaz de usuario reutilizables.
- `/navigation`: Configuración de enrutamiento y navegación.
- `/hooks` y `/contexts`: Para el manejo del estado global y lógica reutilizable.
- `/services`: Lógica de consumo de APIs y servicios externos (ej. MangaBotService).
- `/types`: Definiciones de tipos de TypeScript.

---

## ⚙️ Backend (Servidor API)

El Backend es una API REST construida con **Node.js** y **Express**, que actúa como núcleo para proveer datos a la app móvil, posiblemente extrayendo información de otros sitios web.

### Tecnologías y Librerías Principales:
- **Framework:** Express (`^4.19.2`).
- **Base de Datos:** PostgreSQL (`pg`, con `node-pg-migrate` para migraciones de esquema).
- **Caché / Jobs:** Redis (`ioredis`).
- **Autenticación y Seguridad:**
  - Passport (`passport`, `passport-google-oauth20`) para login social.
  - JWT (`jsonwebtoken`) y bcrypt (`bcryptjs`).
  - Helmet y express-rate-limit para seguridad básica y límite de peticiones.
- **Scraping / Automatización:**
  - `cheerio` (parseo de HTML).
  - `playwright-core` y `cloakbrowser` (posiblemente para evadir bloqueos antibot, como Cloudflare, durante el web scraping de mangas o animes).
- **Almacenamiento y Archivos:**
  - `@aws-sdk/client-s3` (para subir contenido a S3 o Cloudflare R2).
  - `multer` (para manejo de subida de archivos locales).
- **Tareas Programadas:** `node-cron`.

### Arquitectura de Carpetas:
- `/routes`: Definición de los endpoints de la API.
- `/services`: Lógica de negocio pesada, posiblemente los scripts de scraping y comunicación con bases de datos.
- `/middleware`: Controladores intermedios para validación de tokens y permisos.
- `/db` y `/migrations`: Configuración de conexión a PostgreSQL y scripts SQL para la estructura de las tablas.
- `/uploads` y `/videos`: Directorios para el manejo de archivos multimedia estáticos o temporales.

---

## 🧹 Limpieza del Proyecto

Como parte del mantenimiento, se ha creado una nueva carpeta llamada `_temp_files/` en la raíz del proyecto. Los siguientes archivos residuales (logs, scripts de prueba, HTML cacheados y la compilación APK) han sido movidos allí para mantener limpio el directorio principal:

- `hentaila_detail.html`
- `hentaila_episode.html`
- `hentaila_vid.html`
- `scratch_hentaila.mjs`
- `scratch_test.js`
- `test_regex.js`
- `logs.txt`
- `pixel-portproxy.ps1`
- `pixelnosekai.apk`
