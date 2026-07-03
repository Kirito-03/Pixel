# 🚀 Despliegue del Admin Panel - Guía Rápida

Esta guía te ayudará a desplegar el panel de administración paso a paso.

## 📋 Checklist Pre-Despliegue

- [ ] Configurar credenciales de Google OAuth (ver `GOOGLE_OAUTH_SETUP.md`)
- [ ] Aplicar schema de base de datos
- [ ] Instalar dependencias del servidor
- [ ] Reiniciar containers Docker
- [ ] Probar autenticación

---

## 🔧 Paso 1: Configurar Google OAuth

Sigue la guía completa en [`GOOGLE_OAUTH_SETUP.md`](./GOOGLE_OAUTH_SETUP.md) para obtener tus credenciales de Google OAuth.

Una vez obtenidas, actualiza `.env.docker`:

```env
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
```

---

## 🗄️ Paso 2: Aplicar Schema de Base de Datos

Ejecuta el siguiente comando para crear las tablas del admin panel:

```bash
docker exec -i pixel_postgres psql -U root -d bd_pixel < server/admin_schema.sql
```

Esto creará las tablas:
- `admin_users` - Administradores autenticados
- `anime_content` - Catálogo de anime
- `anime_episodes` - Episodios con enlaces de video

---

## 📦 Paso 3: Instalar Dependencias

Las dependencias OAuth ya deberían estar instaladas. Si no, ejecuta:

```bash
cd server
npm install passport passport-google-oauth20 express-session jsonwebtoken cookie-parser
```

---

## 🐳 Paso 4: Reiniciar Containers

Reinicia el backend para cargar las nuevas configuraciones:

```bash
# Detener containers
docker-compose down

# Reconstruir y reiniciar
docker-compose up -d --build backend
```

Verifica que los containers estén corriendo:

```bash
docker-compose ps
```

---

## ✅ Paso 5: Verificar Despliegue

### 1. Verificar que el servidor esté corriendo:

```bash
curl http://localhost:3001/health
```

Deberías ver: `{"ok":true,"uptime":...}`

### 2. Verificar que las tablas se crearon:

```bash
docker exec -it pixel_postgres psql -U root -d bd_pixel -c "\dt"
```

Deberías ver `anime_content`, `anime_episodes`, y `admin_users` en la lista.

### 3. Acceder al Admin Panel:

Abre tu navegador en: **http://localhost:3001/admin**

Deberías ver la página de login con el botón "Continuar con Google".

---

## 🔐 Paso 6: Primer Login

1. Click en **"Continuar con Google"**
2. Selecciona tu cuenta (debe ser `leojuniorss.8lj@gmail.com` o `pixel@dragonfluxstudios.com`)
3. Acepta los permisos
4. Serás redirigido al dashboard

---

## 🎯 Paso 7: Agregar Tu Primer Anime

### Opción 1: Desde TMDB (Recomendado)

1. Ve a **"Agregar Anime"** en el sidebar
2. Busca el anime en TMDB (ej: "Naruto")
3. Click en el resultado para auto-completar el formulario
4. Ajusta los datos si es necesario
5. Click en **"Guardar"**

### Opción 2: Manual

1. Ve a **"Agregar Anime"**
2. Completa el formulario manualmente:
   - Título (requerido)
   - Descripción
   - URLs de póster y banner
   - Géneros
   - Estado (Airing, Finished, Upcoming)
   - Total de episodios
3. Click en **"Guardar"**

---

## 📺 Paso 8: Agregar Episodios

1. Ve a **"Biblioteca de Anime"**
2. Click en **"Gestionar"** en el anime que creaste
3. Click en **"Agregar Episodio"**
4. Completa:
   - Número de episodio
   - Título (opcional)
   - **URL del video** (enlace de Google Drive)
   - Temporada (default: 1)
   - Calidad (720p, 1080p, 4K)
5. Click en **"Guardar"**

### 🔗 Cómo obtener enlace directo de Google Drive:

1. Sube el video a Google Drive
2. Click derecho → **"Obtener enlace"**
3. Cambia a **"Cualquier persona con el enlace"**
4. Copia el enlace (formato: `https://drive.google.com/file/d/FILE_ID/view`)
5. Pégalo en el campo "URL del video"

> **Nota**: El backend convertirá automáticamente el enlace de Google Drive a un enlace directo de streaming.

---

## 🔍 Verificar en la App Cliente

1. Abre la app React Native
2. Busca el anime que agregaste
3. Debería aparecer en los resultados
4. Click para ver detalles
5. Selecciona el episodio
6. El video debería reproducirse desde Google Drive

---

## 🐛 Solución de Problemas

### El admin panel no carga

```bash
# Verificar logs del backend
docker-compose logs -f backend

# Verificar que el directorio admin existe
ls server/admin
```

### Error "Email no autorizado"

- Verifica que tu email esté en `ADMIN_EMAILS` en `.env.docker`
- Reinicia el container: `docker-compose restart backend`

### Error "redirect_uri_mismatch"

- Verifica que la URI de redirección en Google Cloud Console sea exactamente:
  `http://localhost:3001/auth/google/callback`

### Las tablas no se crearon

```bash
# Verificar que el schema se aplicó correctamente
docker exec -it pixel_postgres psql -U root -d bd_pixel -c "SELECT * FROM anime_content LIMIT 1;"
```

Si da error, vuelve a ejecutar:

```bash
docker exec -i pixel_postgres psql -U root -d bd_pixel < server/admin_schema.sql
```

---

## 📊 Endpoints Disponibles

### Autenticación:
- `GET /auth/google` - Iniciar OAuth
- `GET /auth/google/callback` - Callback OAuth
- `GET /auth/admin/me` - Info del admin
- `POST /auth/admin/logout` - Cerrar sesión

### Anime:
- `GET /api/admin/anime` - Listar anime
- `POST /api/admin/anime` - Crear anime
- `PUT /api/admin/anime/:id` - Actualizar anime
- `DELETE /api/admin/anime/:id` - Eliminar anime

### Episodios:
- `GET /api/admin/episodes/:animeId` - Listar episodios
- `POST /api/admin/episodes` - Crear episodio
- `PUT /api/admin/episodes/:id` - Actualizar episodio
- `DELETE /api/admin/episodes/:id` - Eliminar episodio

### TMDB:
- `GET /api/admin/tmdb/search?q=naruto` - Buscar en TMDB
- `GET /api/admin/tmdb/details/:tmdbId` - Detalles de TMDB

### Dashboard:
- `GET /api/admin/stats` - Estadísticas generales

---

## 🎉 ¡Listo!

Tu panel de administración está completamente funcional. Ahora puedes:

✅ Gestionar tu catálogo de anime  
✅ Agregar episodios con enlaces de Google Drive  
✅ Autocompletar metadata desde TMDB  
✅ Control total sobre tu contenido  

Para más detalles técnicos, consulta [`implementation_plan.md`](./brain/implementation_plan.md).
