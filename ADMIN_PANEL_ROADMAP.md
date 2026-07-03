# 🎬 Pixel No Sekai Admin Panel - Roadmap & Mejoras

Este documento detalla el plan de implementación para el **Panel de Administración** y el nuevo sistema de gestión de contenido propio, eliminando la dependencia de APIs inestables.

## 🎯 Objetivo Principal

Crear un sistema robusto para gestionar el contenido de anime de forma manual y controlada, utilizando **Google Drive** como almacenamiento en la nube (2TB disponibles) y **PostgreSQL** para la metadata, con una interfaz web intuitiva para la administración.

---

## 🏗️ Arquitectura del Sistema

### 1. Almacenamiento (Híbrido)
- **Google Drive**: Almacenamiento principal de videos. Se usarán enlaces directos de descarga/streaming.
- **Servidor Local**: Opción secundaria para contenido de muy alta demanda o caché.
- **PostgreSQL**: Base de datos centralizada para metadata y enlaces.

### 2. Base de Datos (Nuevas Tablas)
Se crearán dos tablas principales en PostgreSQL:

#### `anime_content`
Almacena la metadata de la serie/película.
- `id`: Serial Primary Key
- `tmdb_id`: ID de TMDB (para actualizaciones futuras)
- `title`: Título principal
- `description`: Sinopsis
- `poster_url`: URL del póster vertical
- `banner_url`: URL del banner horizontal
- `genres`: Array de géneros
- `status`: Estado (Emisión, Finalizado, etc.)
- `total_episodes`: Conteo total

#### `anime_episodes`
Almacena la información de cada episodio y su enlace de video.
- `id`: Serial Primary Key
- `anime_id`: FK -> `anime_content`
- `season`: Número de temporada
- `episode_number`: Número de episodio
- `title`: Título del episodio
- `video_url`: Enlace directo (Google Drive / Local)
- `storage_type`: 'gdrive' | 'local'
- `duration`: Duración en minutos

---

## 🛠️ Implementación Técnica

### Fase 1: Backend & API (Servidor Node.js)
Endpoints protegidos para la administración:
- `POST /api/admin/anime`: Crear anime (integración con TMDB para autocompletar datos).
- `GET /api/admin/anime`: Listar biblioteca.
- `PUT /api/admin/anime/:id`: Editar metadata.
- `POST /api/admin/episodes`: Agregar episodio con enlace.
- `GET /api/admin/tmdb/search`: Buscar series en TMDB API.

### Fase 2: Panel de Administración (Frontend Web)
Interfaz web accesible desde `http://localhost:8081/admin` (o ruta protegida).
- **Dashboard**: Vista general de la biblioteca.
- **Buscador TMDB**: Formulario para buscar series por nombre y auto-rellenar datos.
- **Gestor de Episodios**: Interfaz para agregar temporadas y episodios, pegando enlaces de Google Drive.
- **File Uploader**: (Opcional) Subida directa si se usa storage local.

### Fase 3: Integración en App Usuarios
Actualizar la app para priorizar el contenido de la base de datos propia.
- Modificar `animeStreamingService.ts` para buscar primero en PostgreSQL.
- Si no existe en BD propia -> fallback a métodos antiguos (M3U / APIs externas) o mostrar "No disponible".

---

## 🚀 Flujo de Trabajo del Administrador

1.  **Subir Video**: Subir el archivo `.mkv` o `.mp4` a una carpeta en Google Drive.
2.  **Obtener Enlace**: Generar enlace compartido de acceso público.
3.  **Panel Admin**:
    - Buscar la serie (ej: "Naruto") -> El sistema trae la info de TMDB.
    - Crear la serie en la BD.
    - Ir a "Agregar Episodios".
    - Pegar el enlace de Google Drive para el episodio correspondiente.
4.  **Resultado**: El episodio aparece inmediatamente en la App para todos los usuarios.

---

## ✅ Beneficios
- **Control Total**: No dependes de servidores caídos o cambios en APIs externas.
- **Sin Publicidad ni Popups**: Streaming directo y limpio.
- **Mayor Calidad**: Tú decides la calidad del video subido.
- **Estabilidad**: Google Drive ofrece excelente velocidad y disponibilidad.
