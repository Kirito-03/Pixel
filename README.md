# Proyecto Netflix Clone

Una aplicación móvil y web que replica la funcionalidad de Netflix, desarrollada con React Native, Expo y Node.js.

## 📋 Características

- 🔐 **Autenticación completa**: Registro e inicio de sesión de usuarios
- 👤 **Gestión de perfiles**: Múltiples perfiles por usuario
- 🎥 **Catálogo de películas**: Integración con TMDB API para contenido actualizado
- 📱 **Responsive**: Funciona en móvil, tablet y web
- **Mi Lista**: Funcionalidad para guardar películas favoritas
- **Búsqueda**: Buscar películas por título
- 🎨 **UI moderna**: Interfaz inspirada en Netflix con gradientes y animaciones

## Tecnologías utilizadas

### Frontend
- **React Native** 0.81.4
- **Expo** ~54.0.12
- **TypeScript** ~5.9.2
- **React Navigation** 7.x
- **Expo Linear Gradient** para efectos visuales

### Backend
- **Node.js** con Express 4.19.2
- **PostgreSQL** con pg 8.13.1
- **bcryptjs** para encriptación de contraseñas
- **CORS** habilitado para desarrollo

### APIs externas
- **TMDB (The Movie Database)** para catálogo de películas

## 🐳 Quick Start con Docker (Recomendado)

La forma más rápida de ejecutar la aplicación es usando Docker. Todo el backend y la base de datos se configuran automáticamente.

### Prerrequisitos
- **Docker Desktop** instalado ([Descargar aquí](https://www.docker.com/products/docker-desktop))
- Node.js (versión 16 o superior) para el frontend
- Expo CLI (`npm install -g @expo/cli`)

### Pasos rápidos

**1. Clonar y configurar:**
```bash
git clone <url-del-repositorio>
cd netflix_app
npm install
```

**2. Iniciar servicios Docker:**
```bash
docker-compose --env-file .env.docker up -d
```

**3. Verificar servicios:**
```bash
# Ver estado de containers
docker-compose ps

# Ver logs del backend
docker-compose logs -f backend
```

**4. Iniciar el frontend:**
```bash
npm start
# Presiona 'w' para web, 'a' para Android, 'i' para iOS
```

### URLs de servicios

- **Backend API**: `http://localhost:3001`
- **Adminer** (gestión de BD): `http://localhost:8080`
  - Server: `postgres`
  - Username: `root`
  - Password: `netflix_dev_pass`
- **PostgreSQL**: `localhost:5432`

### Comandos útiles

```bash
# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (resetea la BD)
docker-compose down -v

# Ver logs en tiempo real
docker-compose logs -f

# Reconstruir containers después de cambios
docker-compose up -d --build

# Acceder al container del backend
docker-compose exec backend sh

# Acceder a PostgreSQL CLI
docker-compose exec postgres psql -U root -d bd_netflix
```

### Troubleshooting Docker

**Error: "Port already in use"**
```bash
# Ver qué proceso usa el puerto
netstat -ano | findstr :3001

# Detener otros servicios o cambiar puerto en docker-compose.yml
```

**Backend no conecta a PostgreSQL**
```bash
# Verificar que PostgreSQL esté healthy
docker-compose ps

# Reiniciar servicios
docker-compose restart
```

**Datos no persisten**
- Los datos se guardan en volúmenes Docker
- Para reset completo: `docker-compose down -v`

---

## 🚀 Despliegue en VPS (Producción)

Para desplegar Pixel No Sekai en tu propio VPS (Ubuntu/Debian recomendado), sigue estos pasos:

### 1. Preparar el Servidor
```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker y Docker Compose
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker
```

### 2. Clonar el repositorio
```bash
git clone <url-del-repositorio>
cd netflix_app
```

### 3. Configurar Variables de Entorno
Crea un archivo `.env.docker` basado en `.env.example`:
```bash
cp .env.example .env.docker
nano .env.docker
```
Asegúrate de cambiar las contraseñas, URLs y las claves de API (TMDB, Firebase, R2, etc.).

### 4. Levantar los Servicios
```bash
# Iniciar servicios en segundo plano
sudo docker-compose --env-file .env.docker up -d --build
```
Tus servicios estarán corriendo y tu backend estará accesible en el puerto configurado. Para servir la app web, puedes compilar Expo para web y servir los archivos estáticos usando Nginx.

---

## Instalación y configuración (Manual)

### Prerrequisitos
- Node.js (versión 16 o superior)
- PostgreSQL Server
- Expo CLI (`npm install -g @expo/cli`)

### 1. Clonar el repositorio
```bash
git clone <url-del-repositorio>
cd Proyecto_Netflix
```

### 2. Instalar dependencias

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
cd server
npm install
cd ..
```

### 3. Configurar base de datos PostgreSQL

Este proyecto utiliza las siguientes tablas en la base `bd_netflix`:
- `usuarios`: registro y login de usuarios
- `perfiles`: perfiles de usuario
- `listas`: contenedor de la lista "Mi lista" por perfil
- `lista_items`: elementos individuales de "Mi lista"

#### Importar el esquema:
1. Abre psql o tu cliente PostgreSQL preferido
2. Crea la base de datos `bd_netflix` (si no existe)
3. Importa el archivo `server/bd_netflix_postgres.sql`
4. Verifica que se crearon las tablas: `usuarios`, `perfiles`, `listas`, `lista_items`

### 4. Variables de entorno

Crea/ajusta el archivo `.env` en la raíz del proyecto:
```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_USER=root
DB_PASSWORD=tu_password_postgres
DB_NAME=bd_netflix

# Backend
BACKEND_URL=http://localhost:3001
# Para dispositivos/emuladores usar IP local:
# Android: http://10.0.2.2:3001
# iOS: http://192.168.107.105:3001

# TMDB API (opcional - para contenido actualizado)
TMDB_API_KEY=tu_api_key_de_tmdb
```

## Uso

### Iniciar el backend
```bash
cd server
npm start
# o para desarrollo con auto-reload:
npm run dev
```
El backend estará disponible en `http://localhost:3001`

**Verificar salud del backend:**
```bash
curl http://localhost:3001/health
```
Debe responder: `{"ok": true, ...}`

### Iniciar la aplicación (Expo)
```bash
npm start
```

Opciones disponibles:
- **Web**: Presiona `w` o abre `http://localhost:8081`
- **Android**: Presiona `a` (requiere Android Studio/emulador)
- **iOS**: Presiona `i` (requiere Xcode - solo macOS)
- **Expo Go**: Escanea el QR con la app Expo Go

## 📱 Funcionalidades principales

### Autenticación
- **Registro**: `RegisterScreen.tsx` → `POST /auth/register`
- **Login**: `LoginScreen.tsx` → `POST /auth/login`

### Gestión de perfiles
- **Selección**: `ProfileSelectionScreen.tsx` → `GET /profiles`
- **Creación**: Crear nuevos perfiles → `POST /profiles`

### Contenido
- **Catálogo**: Películas populares, mejor valoradas, próximos estrenos
- **Detalles**: Información completa de películas con trailers
- **Búsqueda**: Buscar por título en tiempo real
- **Mi Lista**: `GET/POST/DELETE /my-list/...` → gestión de favoritos

## Estructura del proyecto

```
Proyecto_Netflix/
├── components/          # Componentes reutilizables
│   ├── Header.tsx
│   ├── MovieCard.tsx
│   ├── MovieModal.tsx
│   └── ...
├── screens/            # Pantallas de la aplicación
│   ├── HomeScreen.tsx
│   ├── LoginScreen.tsx
│   ├── ProfileScreen.tsx
│   └── ...
├── contexts/           # Context API para estado global
│   ├── ProfileContext.tsx
│   └── MyListContext.tsx
├── services/           # Servicios y APIs
│   ├── api.ts         # TMDB API
│   └── databaseService.ts
├── server/             # Backend Node.js
│   ├── index.js       # Servidor Express
│   ├── bd_netflix_postgres.sql # Esquema de BD
│   └── package.json
├── navigation/         # Configuración de navegación
├── assets/            # Recursos (iconos, imágenes)
└── types.ts           # Definiciones TypeScript
```

## 🔧 Scripts disponibles

### Frontend
- `npm start` - Inicia Expo development server
- `npm run android` - Inicia en Android
- `npm run ios` - Inicia en iOS
- `npm run web` - Inicia versión web

### Backend
- `npm start` - Inicia servidor de producción
- `npm run dev` - Inicia con nodemon (desarrollo)

## Solución de problemas

### Errores comunes

**Error 409 al registrar:**
- El email ya existe en la base de datos
- Usa un email diferente o verifica la tabla `usuarios`

**Error 401 al iniciar sesión:**
- Credenciales incorrectas
- Verifica email y contraseña

**Error de conexión a la base de datos:**
- Verifica que PostgreSQL esté ejecutándose
- Revisa las credenciales en `.env`
- Confirma que la base `bd_netflix` existe

**Problemas con Expo:**
- Ejecuta `expo doctor` para diagnosticar
- Limpia caché: `expo start -c`
- Reinstala dependencias: `rm -rf node_modules && npm install`

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de uso educativo y no tiene fines comerciales.

## 🙏 Agradecimientos

- [TMDB](https://www.themoviedb.org/) por proporcionar la API de películas
- [Expo](https://expo.dev/) por facilitar el desarrollo multiplataforma
- Inspirado en la interfaz de Netflix

