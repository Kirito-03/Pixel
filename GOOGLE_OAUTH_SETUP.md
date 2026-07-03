# Configuración de Google OAuth - Guía Paso a Paso

Esta guía te ayudará a obtener las credenciales de Google OAuth necesarias para el panel de administración.

## 📋 Requisitos Previos

- Una cuenta de Google
- Acceso a [Google Cloud Console](https://console.cloud.google.com/)

---

## 🔧 Paso 1: Crear un Proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Click en el selector de proyectos (arriba a la izquierda)
3. Click en **"Nuevo Proyecto"**
4. Nombre del proyecto: `Pixel No Sekai Admin`
5. Click en **"Crear"**

---

## 🔑 Paso 2: Habilitar Google+ API

1. En el menú lateral, ve a **"APIs y servicios" → "Biblioteca"**
2. Busca **"Google+ API"**
3. Click en **"Habilitar"**

---

## 🎫 Paso 3: Crear Credenciales OAuth

1. Ve a **"APIs y servicios" → "Credenciales"**
2. Click en **"+ CREAR CREDENCIALES"**
3. Selecciona **"ID de cliente de OAuth"**

### Configurar Pantalla de Consentimiento (si es la primera vez):

1. Click en **"CONFIGURAR PANTALLA DE CONSENTIMIENTO"**
2. Selecciona **"Externo"** → Click en **"Crear"**
3. Completa los campos:
   - **Nombre de la aplicación**: `Pixel No Sekai Admin Panel`
   - **Correo de asistencia**: Tu email
   - **Dominio autorizado**: `localhost` (para desarrollo)
   - **Correo del desarrollador**: Tu email
4. Click en **"Guardar y continuar"**
5. En **"Alcances"**, click en **"Guardar y continuar"** (no necesitas agregar alcances)
6. En **"Usuarios de prueba"**, agrega tus dos emails:
   - `leojuniorss.8lj@gmail.com`
   - `pixel@dragonfluxstudios.com`
7. Click en **"Guardar y continuar"** → **"Volver al panel"**

### Crear ID de Cliente OAuth:

1. Vuelve a **"Credenciales"** → **"+ CREAR CREDENCIALES"** → **"ID de cliente de OAuth"**
2. Tipo de aplicación: **"Aplicación web"**
3. Nombre: `Pixel Admin OAuth Client`
4. **Orígenes de JavaScript autorizados**:
   - `http://localhost:3001`
5. **URIs de redirección autorizados**:
   - `http://localhost:3001/auth/google/callback`
6. Click en **"Crear"**

---

## 📝 Paso 4: Copiar Credenciales

Después de crear el cliente OAuth, verás un modal con:

- **ID de cliente**: `algo-como-esto.apps.googleusercontent.com`
- **Secreto del cliente**: `GOCSPX-algo-secreto`

**¡Copia estos valores!**

---

## ⚙️ Paso 5: Configurar Variables de Entorno

Abre el archivo `.env.docker` y reemplaza los valores:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=TU-CLIENT-ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=TU-CLIENT-SECRET
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
```

---

## 🚀 Paso 6: Reiniciar el Servidor

```bash
# Detener containers
docker-compose down

# Reconstruir y reiniciar
docker-compose up -d --build backend
```

---

## ✅ Paso 7: Probar la Autenticación

1. Abre tu navegador en `http://localhost:3001/admin`
2. Click en **"Continuar con Google"**
3. Selecciona tu cuenta de Google
4. Acepta los permisos
5. Deberías ser redirigido al dashboard

---

## 🔒 Seguridad en Producción

Cuando despliegues a producción, actualiza:

1. **Orígenes de JavaScript autorizados**:
   - `https://tu-dominio.com`

2. **URIs de redirección autorizados**:
   - `https://tu-dominio.com/auth/google/callback`

3. **Variables de entorno**:
   ```env
   GOOGLE_CALLBACK_URL=https://tu-dominio.com/auth/google/callback
   NODE_ENV=production
   ```

4. **Cambiar secrets**:
   - Genera nuevos valores para `JWT_SECRET` y `SESSION_SECRET`

---

## 🐛 Solución de Problemas

### Error: "redirect_uri_mismatch"
- Verifica que la URI de redirección en Google Cloud Console coincida exactamente con `GOOGLE_CALLBACK_URL`

### Error: "Email no autorizado"
- Verifica que tu email esté en `ADMIN_EMAILS` en `.env.docker`
- Verifica que el email esté agregado como "Usuario de prueba" en Google Cloud Console

### Error: "Token inválido"
- Verifica que `JWT_SECRET` esté configurado en `.env.docker`
- Limpia las cookies del navegador y vuelve a intentar

---

## 📚 Referencias

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
