# 🎬 Pixel No Sekai - Guía de Inicio Rápido

## 🚀 Inicio Automático (Recomendado)

### Opción 1: Script Completo (Backend + Frontend)
```bash
# Doble clic o desde terminal:
start.bat
```
Esto levantará automáticamente:
- ✅ PostgreSQL (puerto 5432)
- ✅ Backend API (puerto 3001)
- ✅ Adminer (puerto 8080)
- ✅ Expo App (metro bundler)

### Opción 2: Solo Backend
```bash
start-backend.bat
```
Levanta únicamente los servicios Docker (PostgreSQL + Backend API).

### Opción 3: NPM Scripts
```bash
# Backend
npm run docker:up

# Frontend (en otra terminal)
npm start

# Ver logs backend
npm run docker:logs

# Detener todo
npm run docker:down
```

## 🛑 Detener Servicios

```bash
# Detener Docker
stop.bat

# O con npm
npm run docker:down
```

## 📊 Ver Logs

```bash
# Tiempo real
logs.bat

# O con npm
npm run docker:logs
```

## 🔧 Comandos Útiles

### Backend (Docker)
```bash
# Restart backend
docker-compose restart backend

# Rebuild completo
npm run docker:rebuild

# Verificar salud
curl http://localhost:3001/health
```

### Frontend (Expo)
```bash
# Android
npm run android

# iOS  
npm run ios

# Web
npm run web
```

## 🌐 Servicios

| Servicio | URL | Descripción |
|----------|-----|-------------|
| Backend API | http://localhost:3001 | Express + PostgreSQL |
| PostgreSQL | localhost:5432 | Base de datos |
| Adminer | http://localhost:8080 | UI PostgreSQL |
| Expo Metro | http://localhost:8081 | Bundler React Native |

### Credenciales Adminer
- **System**: PostgreSQL
- **Server**: postgres
- **Username**: pixel_user
- **Password**: pixel_password_2024
- **Database**: pixel_db

## 🐛 Troubleshooting

### Backend no inicia
```bash
# Ver error
docker-compose logs backend

# Rebuild
npm run docker:rebuild
```

### Puerto en uso
```bash
# Ver qué usa el puerto 3001
netstat -ano | findstr :3001

# Detener Docker
docker-compose down
```

### Base de datos vacía
```bash
# Recrear con schema
docker-compose down -v
docker-compose up -d
```

## 📁 Estructura

```
pixel_no_sekai/
├── start.bat              # 🚀 Inicio completo
├── start-backend.bat      # Backend solo
├── stop.bat               # Detener servicios
├── logs.bat               # Ver logs
├── docker-compose.yml     # Config Docker
├── server/                # Backend API
│   ├── index.js          # Express app
│   └── bd_pixel_postgres.sql
├── App.tsx                # Frontend Expo
└── package.json           # Scripts npm
```

## ⚡ Workflow Development

### Primera vez
```bash
# 1. Instalar dependencias
npm install

# 2. Levantar proyecto
start.bat
```

### Día a día
```bash
# Solo ejecutar
start.bat
```

### Antes de commit
```bash
# Detener todo
stop.bat
```

## 🔄 Hot Reload

⚠️ **Nota**: Hot reload del backend está **deshabilitado** para evitar conflictos con node_modules.

Para habilitar:
1. Descomentar en `docker-compose.yml`:
   ```yaml
   volumes:
     - ./server:/app
     - /app/node_modules
   ```
2. Rebuild: `npm run docker:rebuild`

## 📝 Notas

- **PostgreSQL**: Datos persisten en volume `postgres_data`
- **Uploads**: Se guardan en `server/uploads/`  
- **Videos**: Se guardan en `server/videos/` y `server/hls/`
