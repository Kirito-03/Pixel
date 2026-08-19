# Netflix Clone Backend - Dockerfile
# Node.js 20 Alpine para imagen ligera
FROM node:20-alpine

# Metadata
LABEL maintainer="Netflix Clone App"
LABEL description="Backend API for Netflix Clone application"

# Establecer directorio de trabajo
WORKDIR /app

# Instalar ffmpeg (requerido para transcodificación HLS)
RUN apk add --no-cache ffmpeg

# Copiar archivos de dependencias primero (mejor cache de layers)
COPY package*.json ./

# Instalar dependencias de producción
# --omit=dev: instala todo excepto devDependencies (nodemon)
RUN npm install --omit=dev && \
  npm cache clean --force

# Copiar el resto del código fuente
COPY . .

# Crear directorios necesarios para uploads y contenido
RUN mkdir -p uploads/avatars hls videos && \
  chown -R node:node /app

# Dar permisos de ejecución al entrypoint (ANTES de cambiar a usuario no-root)
RUN chmod +x /app/index.js

# Cambiar a usuario no-root por seguridad
USER node

# Exponer puerto
EXPOSE 3001

# Health check interno (Docker lo usa para verificar container health)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:3001/health || exit 1

# Comando de inicio
CMD ["npm", "start"]
