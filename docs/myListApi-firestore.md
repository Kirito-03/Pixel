# `myListApi` en Firestore (`profiles/{uid}/profiles/{profileId}/mylist`)

## Motivación

Los perfiles de usuario en la app se almacenan en Firestore bajo:

```text
profiles/{uid}/profiles/{profileId}
```

donde `profileId` es un identificador generado en cliente (`Date.now()`). El antiguo cliente REST `/my-list` asumía IDs enteros de PostgreSQL y no enviaba token Bearer, provocando errores `401` tras proteger la API.

`services/myListApi.ts` mantiene la misma interfaz pública (`getMyList`, `add`, `remove` y `MyListEntry`), operando directamente sobre Firestore en la subcolección `mylist` (sin guion bajo) del perfil del usuario.

## Ruta y documentos deterministas

Los elementos de Mi Lista se guardan exclusivamente en:

```text
profiles/{uid}/profiles/{profileId}/mylist/{contentType}_{contentId}
```

- **Tipos permitidos**: `movie`, `tv`, `anime`, `manga`.
- **Validación de IDs**:
  - `profileId`: entero seguro positivo (`> 0`).
  - `contentId` para `movie | tv | anime`: entero seguro positivo (`> 0`).
  - `contentId` para `manga`: cadena no vacía de hasta 128 caracteres que cumpla `/^[a-zA-Z0-9._-]+$/`, sin `..`, `/` ni IDs reservados `__.*__`.
- **ID determinista**: `{contentType}_{contentId}` evita colisiones entre tipos y hace idempotente la operación `add` (`setDoc(..., { merge: true })`).

## Seguridad y manejo explícito de errores

Antes de cualquier operación CRUD (`getMyList`, `add`, `remove`):

1. Verifica que exista `auth.currentUser?.uid`.
2. Valida `profileId`.
3. Comprueba con `getDoc` que exista `profiles/{uid}/profiles/{profileId}` perteneciente al usuario autenticado.

Si la lectura del perfil propio o cualquier operación sobre `mylist` (`getDocs`, `setDoc`, `deleteDoc`) falla —incluido `permission-denied` o `unavailable`—, **no se ejecuta ningún fallback** ni se oculta la denegación: se lanza un error claro indicando la etapa y el código de Firestore (sin exponer `uid`, tokens ni secretos).

## Causa raíz del fallo previo y legado en el documento de perfil

- **Ruta errónea en cliente (`my_list` vs `mylist`)**: las reglas reales de Firebase definen la subcolección válida como `profiles/{uid}/profiles/{profileId}/mylist` (sin guion bajo). Al apuntar antes a `my_list`, Firestore devolvía `permission-denied` y activaba un fallback que escribía un mapa `my_list` dentro del documento `profiles/{uid}/profiles/{profileId}`.
- **Por qué el primer `add` funcionó y `remove` falló**: en las reglas del documento de perfil, `validProfileUpdate.changedKeys` permite **añadir campos nuevos** al documento (por lo que el primer `add` pudo crear el campo `my_list`), pero **no permite modificar** un campo `my_list` ya existente (por lo que `remove` y escrituras posteriores fallaban).
- **Conservación del mapa legado (sin migración automática)**: el mapa legado `my_list` en el documento de perfil no se migra ni se borra automáticamente (solo contiene un favorito anime de prueba creado durante las pruebas). Se conserva intacto y queda documentada la **revisión manual pendiente** en caso de que existieran otros datos en algún perfil.

### Reglas de Firestore para el bloque `mylist` (sin relajar autenticación)

> Nunca usar reglas permisivas como `allow read, write: if true;` o `if request.auth != null;`.
> Solo se amplía el bloque `mylist` para admitir `content_id` de tipo `string` en `manga` (y entero positivo en `movie`, `tv`, `anime`) y operaciones `create`/`update` válidas del propietario, manteniendo intactas la autenticación y la verificación de propiedad.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /profiles/{uid}/profiles/{profileId} {
      // Reglas existentes del perfil (no modificadas ni relajadas)

      match /mylist/{itemId} {
        allow read, delete: if request.auth != null
          && request.auth.uid == uid
          && exists(/databases/$(database)/documents/profiles/$(uid)/profiles/$(profileId));

        allow create, update: if request.auth != null
          && request.auth.uid == uid
          && exists(/databases/$(database)/documents/profiles/$(uid)/profiles/$(profileId))
          && request.resource.data.content_type in ['movie', 'tv', 'anime', 'manga']
          && (
            (request.resource.data.content_type == 'manga'
              && request.resource.data.content_id is string
              && request.resource.data.content_id.size() > 0
              && request.resource.data.content_id.size() <= 128)
            || (request.resource.data.content_type in ['movie', 'tv', 'anime']
              && request.resource.data.content_id is int
              && request.resource.data.content_id > 0)
          )
          && itemId == request.resource.data.content_type + '_' + string(request.resource.data.content_id);
      }
    }
  }
}
```

## Enriquecimiento de metadatos

En `getMyList(profileId)`:

- Para `anime` y `manga`, consulta directamente el catálogo SQL público mediante `backendClient.get`:
  - `anime`: `GET /api/catalog/anime/{id}`
  - `manga`: `GET /api/manga/{id}` (evitando importar `mangaApi` para prevenir ciclos).
- Concurrencia acotada a **5** peticiones simultáneas.
- **Sin credenciales**: las llamadas usan `{ withCredentials: false }` y no envían tokens ni headers de autenticación hacia URLs custom.
- **Tolerancia a fallos**: si el catálogo público devuelve `404`, error de red o falta de metadatos, la entrada se conserva en la lista con valores de respaldo (`null`) y nunca se elimina.

## Pruebas unitarias (con mocks)

Las pruebas en `tests/myListApi.test.mjs` ejecutan `services/myListApi.ts` usando mocks en memoria de Firebase Auth, Firestore y `backendClient`. No escriben en favoritos reales ni persisten tokens.

```bash
node --test tests/myListApi.test.mjs
```
