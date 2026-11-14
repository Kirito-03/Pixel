import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const Module = require('node:module');

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const MY_LIST_API_TS = path.join(PROJECT_ROOT, 'services', 'myListApi.ts');

function createFirestoreError(code, message = `Firestore error: ${code}`) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Carga services/myListApi.ts transpilado en memoria con mocks aislados de
 * Firebase Auth, Firestore y backendClient (sin tocar datos reales).
 */
function loadMyListApiWithMocks({
  currentUser = { uid: 'user-123' },
  authStateReadyImpl = null,
  existingProfiles = new Set(['profiles/user-123/profiles/1756000000000']),
  initialDocs = new Map(),
  backendGetImpl = async () => ({ data: null }),
  getDocError = null,
  getDocsError = null,
  setDocError = null,
  deleteDocError = null,
} = {}) {
  const store = new Map(initialDocs);
  const ops = {
    getDocCalls: [],
    getDocsCalls: [],
    setDocCalls: [],
    deleteDocCalls: [],
    backendGetCalls: [],
  };

  const mockAuth = { currentUser };
  if (authStateReadyImpl) mockAuth.authStateReady = () => authStateReadyImpl(mockAuth);
  const mockDb = { __mockDb: true };

  const firestoreMock = {
    doc(_db, ...segments) {
      return { __type: 'doc', path: segments.join('/') };
    },
    collection(_db, ...segments) {
      return { __type: 'collection', path: segments.join('/') };
    },
    orderBy(field, direction) {
      return { __type: 'orderBy', field, direction };
    },
    query(colRef, ...constraints) {
      return { __type: 'query', path: colRef.path, constraints };
    },
    serverTimestamp() {
      return { __serverTimestamp: true, iso: '2026-11-13T12:00:00.000Z' };
    },
    async getDoc(docRef) {
      ops.getDocCalls.push(docRef.path);
      if (getDocError) {
        throw typeof getDocError === 'function' ? getDocError(docRef) : getDocError;
      }
      const exists = existingProfiles.has(docRef.path) || store.has(docRef.path);
      return {
        exists: () => exists,
        id: docRef.path.split('/').pop(),
        data: () => store.get(docRef.path),
      };
    },
    async setDoc(docRef, data, options) {
      ops.setDocCalls.push({ path: docRef.path, data, options });
      if (setDocError) {
        throw typeof setDocError === 'function' ? setDocError(docRef, data, options) : setDocError;
      }
      const resolved = { ...data };
      if (resolved.added_at && resolved.added_at.__serverTimestamp) {
        resolved.added_at = new Date(resolved.added_at.iso);
      }
      store.set(docRef.path, resolved);
    },
    async deleteDoc(docRef) {
      ops.deleteDocCalls.push(docRef.path);
      if (deleteDocError) {
        throw typeof deleteDocError === 'function' ? deleteDocError(docRef) : deleteDocError;
      }
      store.delete(docRef.path);
    },
    async getDocs(q) {
      ops.getDocsCalls.push(q.path);
      if (getDocsError) {
        throw typeof getDocsError === 'function' ? getDocsError(q) : getDocsError;
      }
      const prefix = `${q.path}/`;
      const docs = [];
      for (const [docPath, data] of store.entries()) {
        if (docPath.startsWith(prefix) && !docPath.slice(prefix.length).includes('/')) {
          docs.push({
            id: docPath.slice(prefix.length),
            data: () => data,
          });
        }
      }
      return { docs };
    },
  };

  const backendClientMock = {
    backendClient: {
      async get(url, config) {
        ops.backendGetCalls.push({ url, config });
        return backendGetImpl(url, config);
      },
    },
  };

  const source = fs.readFileSync(MY_LIST_API_TS, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: MY_LIST_API_TS,
  });

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'firebase/firestore') return firestoreMock;
    if (request === './firebase') return { auth: mockAuth, db: mockDb };
    if (request === './backendClient') return backendClientMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(MY_LIST_API_TS);
    mod.filename = MY_LIST_API_TS;
    mod.paths = Module._nodeModulePaths(path.dirname(MY_LIST_API_TS));
    mod._compile(outputText, MY_LIST_API_TS);
    return { ...mod.exports, store, ops, mockAuth };
  } finally {
    Module._load = originalLoad;
  }
}

const VALID_PROFILE_ID = 1756000000000;

test('rechaza operaciones CRUD si no hay usuario autenticado en Firebase', async () => {
  const { myListApi } = loadMyListApiWithMocks({ currentUser: null });

  await assert.rejects(() => myListApi.getMyList(VALID_PROFILE_ID), /no autenticado/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, 42, 'anime'), /no autenticado/i);
  await assert.rejects(() => myListApi.remove(VALID_PROFILE_ID, 42, 'anime'), /no autenticado/i);
});

test('rechaza CRUD si el perfil no existe o no pertenece al usuario actual', async () => {
  const { myListApi } = loadMyListApiWithMocks({
    currentUser: { uid: 'user-123' },
    existingProfiles: new Set(),
  });

  await assert.rejects(() => myListApi.getMyList(VALID_PROFILE_ID), /no existe|no pertenece/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, 42, 'anime'), /no existe|no pertenece/i);
  await assert.rejects(() => myListApi.remove(VALID_PROFILE_ID, 42, 'anime'), /no existe|no pertenece/i);
});

test('valida profileId, contentType y contentId evitando IDs inseguros', async () => {
  const { myListApi } = loadMyListApiWithMocks();

  await assert.rejects(() => myListApi.getMyList(0), /profileId inválido/i);
  await assert.rejects(() => myListApi.getMyList(-10), /profileId inválido/i);
  await assert.rejects(() => myListApi.getMyList(1.5), /profileId inválido/i);

  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, 42, 'podcast'), /Tipo de contenido inválido/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, 'abc', 'anime'), /contentId inválido/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, 0, 'movie'), /contentId inválido/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, '../secret', 'manga'), /contentId inválido/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, 'a/b', 'manga'), /contentId inválido/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, '__reserved__', 'manga'), /contentId inválido/i);
  await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, '   ', 'manga'), /contentId inválido/i);
});

test('add y remove usan rutas seguras y deterministas en profiles/{uid}/profiles/{profileId}/mylist', async () => {
  const profilePath = `profiles/user-123/profiles/${VALID_PROFILE_ID}`;
  const legacyProfileData = {
    id: VALID_PROFILE_ID,
    name: 'Arle',
    my_list: {
      anime_999: {
        content_id: 999,
        content_type: 'anime',
        added_at: '2026-11-13T08:00:00.000Z',
      },
    },
  };
  const { myListApi, store, ops } = loadMyListApiWithMocks({
    initialDocs: new Map([[profilePath, structuredClone(legacyProfileData)]]),
  });

  const resAddAnime = await myListApi.add(VALID_PROFILE_ID, 42, 'anime');
  const resAddMovie = await myListApi.add(VALID_PROFILE_ID, 42, 'movie');
  const resAddManga = await myListApi.add(VALID_PROFILE_ID, 'a96676e5-8ae2-425e-b549-7f15dd34a6d8', 'manga');

  assert.deepEqual(resAddAnime, { ok: true });
  assert.deepEqual(resAddMovie, { ok: true });
  assert.deepEqual(resAddManga, { ok: true });

  assert.equal(store.has(`profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist/anime_42`), true);
  assert.equal(store.has(`profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist/movie_42`), true);
  assert.equal(
    store.has(
      `profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist/manga_a96676e5-8ae2-425e-b549-7f15dd34a6d8`
    ),
    true
  );

  // Idempotencia: volver a añadir no duplica documentos
  await myListApi.add(VALID_PROFILE_ID, 42, 'anime');
  assert.equal(ops.setDocCalls[0].options?.merge, true);
  assert.equal(ops.setDocCalls.every((c) => c.path.includes('/mylist/')), true);

  const resRemove = await myListApi.remove(VALID_PROFILE_ID, 42, 'anime');
  assert.deepEqual(resRemove, { ok: true });
  assert.equal(store.has(`profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist/anime_42`), false);
  assert.equal(ops.deleteDocCalls[0], `profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist/anime_42`);

  // El mapa legado en el documento del perfil permanece intacto (sin migración ni borrado)
  assert.deepEqual(store.get(profilePath), legacyProfileData);
});

test('remove elimina IDs aleatorios antiguos del mismo título y conserva otros tipos y perfiles', async () => {
  const base = `profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist`;
  const other = 'profiles/other-user/profiles/123/mylist/random';
  const { myListApi, store } = loadMyListApiWithMocks({ initialDocs: new Map([
    [`${base}/old-random-id`, { content_id: 42, content_type: 'anime' }],
    [`${base}/keep-movie`, { content_id: 42, content_type: 'movie' }],
    [`${base}/keep-anime`, { content_id: 43, content_type: 'anime' }],
    [other, { content_id: 42, content_type: 'anime' }],
  ]) });
  await myListApi.remove(VALID_PROFILE_ID, 42, 'anime');
  assert.equal(store.has(`${base}/old-random-id`), false);
  assert.equal(store.has(`${base}/keep-movie`), true);
  assert.equal(store.has(`${base}/keep-anime`), true);
  assert.equal(store.has(other), true);
});

test('getMyList enriquece anime y manga sin credenciales y conserva entradas si falta metadata', async () => {
  const profilePath = `profiles/user-123/profiles/${VALID_PROFILE_ID}`;
  const basePath = `${profilePath}/mylist`;
  const initialDocs = new Map([
    [
      profilePath,
      {
        id: VALID_PROFILE_ID,
        my_list: {
          anime_999: {
            content_id: 999,
            content_type: 'anime',
            added_at: '2026-11-13T12:00:00.000Z',
          },
        },
      },
    ],
    [
      `${basePath}/anime_10`,
      { content_id: 10, content_type: 'anime', added_at: new Date('2026-11-13T10:00:00.000Z') },
    ],
    [
      `${basePath}/manga_mg-1`,
      { content_id: 'mg-1', content_type: 'manga', added_at: new Date('2026-11-13T11:00:00.000Z') },
    ],
    [
      `${basePath}/anime_404`,
      { content_id: 404, content_type: 'anime', added_at: new Date('2026-11-13T09:00:00.000Z') },
    ],
    [
      `${basePath}/movie_550`,
      { content_id: 550, content_type: 'movie', added_at: new Date('2026-11-13T08:00:00.000Z') },
    ],
    [
      `${basePath}/invalid_doc`,
      { content_id: '../bad', content_type: 'manga', added_at: new Date('2026-11-13T07:00:00.000Z') },
    ],
  ]);

  const { myListApi, ops } = loadMyListApiWithMocks({
    initialDocs,
    backendGetImpl: async (url) => {
      if (url === '/api/catalog/anime/10') {
        return {
          data: {
            title: 'Frieren',
            poster_url: 'https://img.example/frieren.jpg',
            banner_url: 'https://img.example/frieren-banner.jpg',
            total_episodes: 28,
          },
        };
      }
      if (url === '/api/manga/mg-1') {
        return {
          data: {
            title: 'Berserk',
            cover_url: 'https://img.example/berserk.jpg',
            chapter_count: 376,
          },
        };
      }
      if (url === '/api/catalog/anime/404') {
        const err = new Error('Not found');
        err.response = { status: 404 };
        throw err;
      }
      return { data: null };
    },
  });

  const entries = await myListApi.getMyList(VALID_PROFILE_ID);

  // Lee exclusivamente de mylist (ignora mapa legado my_list y documento corrupto)
  assert.equal(entries.length, 4);
  assert.deepEqual(ops.getDocsCalls, [basePath]);

  // Ordenado por added_at descendente
  assert.equal(entries[0].content_type, 'manga');
  assert.equal(entries[0].content_id, 'mg-1');
  assert.equal(entries[0].anime_title, 'Berserk');
  assert.equal(entries[0].poster_url, 'https://img.example/berserk.jpg');
  assert.equal(entries[0].total_episodes, 376);

  assert.equal(entries[1].content_type, 'anime');
  assert.equal(entries[1].content_id, 10);
  assert.equal(entries[1].anime_title, 'Frieren');
  assert.equal(entries[1].banner_url, 'https://img.example/frieren-banner.jpg');
  assert.equal(entries[1].total_episodes, 28);

  // Entrada 404 conservada sin borrarse
  assert.equal(entries[2].content_type, 'anime');
  assert.equal(entries[2].content_id, 404);
  assert.equal(entries[2].anime_title, null);

  // Movie sin llamadas al catálogo SQL
  assert.equal(entries[3].content_type, 'movie');
  assert.equal(entries[3].content_id, 550);

  // Solo 3 GET públicos (2 anime + 1 manga) y sin credenciales
  assert.equal(ops.backendGetCalls.length, 3);
  for (const call of ops.backendGetCalls) {
    assert.equal(call.config?.withCredentials, false);
    assert.equal(call.config?.headers, undefined);
  }
});

test('getMyList limita la concurrencia de enriquecimiento de metadatos', async () => {
  const basePath = `profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist`;
  const initialDocs = new Map();
  for (let i = 1; i <= 12; i += 1) {
    initialDocs.set(`${basePath}/anime_${i}`, {
      content_id: i,
      content_type: 'anime',
      added_at: new Date(Date.now() - i * 1000),
    });
  }

  let active = 0;
  let maxActive = 0;

  const { myListApi } = loadMyListApiWithMocks({
    initialDocs,
    backendGetImpl: async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return { data: { title: `Anime ${url.split('/').pop()}` } };
    },
  });

  const entries = await myListApi.getMyList(VALID_PROFILE_ID);
  assert.equal(entries.length, 12);
  assert.ok(maxActive <= 5, `Se esperaba concurrencia <= 5, fue ${maxActive}`);
  assert.ok(maxActive >= 2, `Se esperaba ejecución concurrente, fue ${maxActive}`);
});

test('errores no ocultan denegacion (permission-denied ni otros errores de Firestore)', async () => {
  // 1) Falla lectura del perfil propio con permission-denied -> mensaje claro y sin uid
  const profileReadDenied = loadMyListApiWithMocks({
    getDocError: createFirestoreError('permission-denied'),
  });

  await assert.rejects(
    () => profileReadDenied.myListApi.add(VALID_PROFILE_ID, 42, 'anime'),
    (err) => {
      assert.match(err.message, /lectura del perfil/i);
      assert.match(err.message, /permission-denied/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );
  assert.equal(profileReadDenied.ops.setDocCalls.length, 0);

  // 2) Falla subcolección mylist con permission-denied -> NO se oculta ni hay fallback
  const subcolDenied = loadMyListApiWithMocks({
    getDocsError: createFirestoreError('permission-denied'),
    setDocError: createFirestoreError('permission-denied'),
    deleteDocError: createFirestoreError('firestore/permission-denied'),
  });

  await assert.rejects(
    () => subcolDenied.myListApi.getMyList(VALID_PROFILE_ID),
    (err) => {
      assert.match(err.message, /lectura de la subcolección/i);
      assert.match(err.message, /permission-denied/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );
  await assert.rejects(
    () => subcolDenied.myListApi.add(VALID_PROFILE_ID, 'mg-uuid-1', 'manga'),
    (err) => {
      assert.match(err.message, /escritura de Mi Lista \(subcolección\)/i);
      assert.match(err.message, /permission-denied/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );
  await assert.rejects(
    () => subcolDenied.myListApi.remove(VALID_PROFILE_ID, 42, 'anime'),
    (err) => {
      assert.match(err.message, /eliminación de Mi Lista \(subcolección\)/i);
      assert.match(err.message, /firestore\/permission-denied/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );

  // 3) Falla subcolección mylist con unavailable -> mensaje claro y sin uid
  const subcolUnavailable = loadMyListApiWithMocks({
    getDocsError: createFirestoreError('unavailable'),
    setDocError: createFirestoreError('unavailable'),
    deleteDocError: createFirestoreError('unavailable'),
  });

  await assert.rejects(
    () => subcolUnavailable.myListApi.getMyList(VALID_PROFILE_ID),
    (err) => {
      assert.match(err.message, /lectura de la subcolección/i);
      assert.match(err.message, /unavailable/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );
  await assert.rejects(
    () => subcolUnavailable.myListApi.add(VALID_PROFILE_ID, 42, 'anime'),
    (err) => {
      assert.match(err.message, /escritura de Mi Lista \(subcolección\)/i);
      assert.match(err.message, /unavailable/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );
  await assert.rejects(
    () => subcolUnavailable.myListApi.remove(VALID_PROFILE_ID, 42, 'anime'),
    (err) => {
      assert.match(err.message, /eliminación de Mi Lista \(subcolección\)/i);
      assert.match(err.message, /unavailable/i);
      assert.equal(err.message.includes('user-123'), false);
      return true;
    }
  );
});

test('H favorites have a separate safe key and are hidden without adult opt-in', async () => {
  const { myListApi, store, ops } = loadMyListApiWithMocks({ backendGetImpl: async () => ({ data: { title: 'Serie de prueba', poster_path: 'https://example.test/poster.jpg', episodes: [] } }) });
  await myListApi.add(VALID_PROFILE_ID, 'serie-demo', 'h_anime');
  const key = `profiles/user-123/profiles/${VALID_PROFILE_ID}/mylist/h_anime_serie-demo`;
  assert.equal(store.get(key).content_id, 'serie-demo');
  assert.equal(store.get(key).content_type, 'h_anime');
  assert.deepEqual(await myListApi.getMyList(VALID_PROFILE_ID), []);
  assert.equal(ops.backendGetCalls.length, 0, 'Disabled section must not fetch adult metadata');
  const entries = await myListApi.getMyList(VALID_PROFILE_ID, { includeAdult: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].anime_title, 'Serie de prueba');
  assert.equal(ops.backendGetCalls[0].url, '/api/nsfw/details/serie-demo');
  await myListApi.remove(VALID_PROFILE_ID, 'serie-demo', 'h_anime');
  assert.equal(store.has(key), false);
  for (const id of ['../bad','a/b','__reserved__','', 'x'.repeat(129)]) {
    await assert.rejects(() => myListApi.add(VALID_PROFILE_ID, id, 'h_anime'), /contentId inválido/);
  }
});

test('first list request waits for persisted Firebase authentication', async () => {
  let ready = false;
  const { myListApi, ops } = loadMyListApiWithMocks({ currentUser: null, authStateReadyImpl: async auth => {
    await Promise.resolve(); auth.currentUser = { uid: 'user-123' }; ready = true;
  } });
  await myListApi.getMyList(VALID_PROFILE_ID);
  assert.equal(ready, true);
  assert.equal(ops.getDocCalls[0], `profiles/user-123/profiles/${VALID_PROFILE_ID}`);
});
