# 🔧 Troubleshooting - Scripts de Inicio

## Problema: `start.bat` abre ventana y no hace nada

### Causa Común #1: Docker no está corriendo

**Solución**:
1. Abre **Docker Desktop**
2. Espera a que aparezca "Docker Desktop is running" (puede tardar 1-2 minutos)
3. Verifica en terminal:
   ```bash
   docker ps
   ```
4. Vuelve a ejecutar `start.bat`

### Causa Común #2: Puerto en uso

**Síntoma**: Error "port is already allocated"

**Solución**:
```bash
# Ver qué usa el puerto 3001
netstat -ano | findstr :3001

# Detener servicio anterior
docker-compose down

# Reintentar
start.bat
```

### Causa Común #3: Comandos no ejecutan

**Solución**: Ejecutar desde terminal en vez de doble clic:

```bash
# Abrir terminal en la carpeta del proyecto
cd c:\Users\ASUS\Documents\Projects\pixel_no_sekai

# Ejecutar script
start.bat
```

## Método Alternativo: Manual

Si los scripts no funcionan, hazlo manualmente:

### Opción A: Comandos directos

```bash
# Terminal 1: Backend
cd c:\Users\ASUS\Documents\Projects\pixel_no_sekai
docker-compose up -d
docker-compose logs -f backend

# Terminal 2: Frontend (otra terminal)
cd c:\Users\ASUS\Documents\Projects\pixel_no_sekai
npm start
```

### Opción B: NPM Scripts

```bash
# Terminal 1: Backend
npm run docker:up

# Ver logs (opcional)
npm run docker:logs

# Terminal 2: Frontend
npm start
```

## Verificación Paso a Paso

### 1. Docker funcionando?
```bash
docker ps
# Debe mostrar lista de containers (puede estar vacía)
```

### 2. Backend levantado?
```bash
docker-compose ps
# Debe mostrar: pixel_backend, pixel_postgres (Up)
```

### 3. Backend responde?
```bash
curl http://localhost:3001/health
# Debe retornar: {"ok":true,"db":{"ok":true}}
```

### 4. Expo funciona?
```bash
npm start
# Debe abrir metro bundler
```

## Errores Comunes

### "docker: command not found"
- Docker no instalado o no en PATH
- Reinicia terminal después de instalar Docker

### "npm: command not found"
- Node.js no instalado
- Descarga: https://nodejs.org

### "Error: EADDRINUSE"
- Puerto ya en uso
- Solución: `docker-compose down`

### Container restart loop
```bash
# Ver el error
docker-compose logs backend

# Rebuild si es necesario
npm run docker:rebuild
```

## Método Más Simple

Si nada funciona, usa este método simple:

```bash
# 1. Backend (una sola vez)
docker-compose up -d

# 2. Frontend (cada vez que desarrolles)
npm start
```

Para detener backend cuando termines:
```bash
docker-compose down
```

## Ayuda Adicional

Si sigues con problemas:

1. **Verifica versiones**:
   ```bash
   docker --version
   node --version
   npm --version
   ```

2. **Rebuild completo**:
   ```bash
   docker-compose down -v
   docker-compose build --no-cache
   docker-compose up -d
   ```

3. **Logs detallados**:
   ```bash
   docker-compose logs --tail=100 backend
   ```
