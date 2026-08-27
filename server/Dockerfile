# Netflix Clone Backend - Dockerfile
# Node.js 20 Alpine para imagen ligera
FROM node:20-bookworm-slim

# Metadata
LABEL maintainer="Netflix Clone App"
LABEL description="Backend API for Netflix Clone application"

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias para Chromium y fuentes de Windows para spoofing de Cloudflare
# Habilitar contrib y non-free para mscorefonts
RUN sed -i -e 's/main$/main contrib non-free/g' /etc/apt/sources.list.d/debian.sources || true && \
    echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections && \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libx11-xcb1 libxcb1 libxshmfence1 fonts-liberation \
    ttf-mscorefonts-installer fontconfig \
    && rm -rf /var/lib/apt/lists/*

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
