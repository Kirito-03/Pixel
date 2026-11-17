export type ProgressKind = 'manga' | 'h_anime';
export type ProgressScope = { uid: string; profileId: number };
export type ContentProgress = {
  kind: ProgressKind; id: string; updatedAt: number; revision: string;
  chapterId?: string; chapterNumber?: string; episodeNumber?: number;
  currentTime?: number; duration?: number; positionKnown?: boolean;
};
export type ProgressSnapshot = { records: Record<string, ContentProgress>; pendingCount: number; pendingKeys: string[]; lastSyncedAt: number; syncing: boolean; failed: boolean };
type State = { records: Record<string, ContentProgress>; pending: Record<string, ContentProgress>; lastSyncedAt: number; syncing: boolean; failed: boolean };
type Dependencies = {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  remote: { read(scope: ProgressScope): Promise<Record<string, ContentProgress>>; write(scope: ProgressScope, rows: ContentProgress[]): Promise<Record<string, ContentProgress>> };
  assertScope(scope: ProgressScope): void; now?: () => number;
};
export function progressKey(kind: ProgressKind, id: string) { return `${kind}:${id}`; }
export function validContentProgress(value: any): value is ContentProgress {
  if (!value || !['manga','h_anime'].includes(value.kind) || typeof value.id !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(value.id) ||
      !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || typeof value.revision !== 'string' || value.revision.length > 100) return false;
  if (value.kind === 'manga') return typeof value.chapterId === 'string' && value.chapterId.length > 0 && value.chapterId.length <= 2048 &&
    typeof value.chapterNumber === 'string' && value.chapterNumber.length <= 64;
  return Number.isFinite(value.episodeNumber) && value.episodeNumber > 0 && Number.isFinite(value.currentTime) && value.currentTime >= 0 &&
    Number.isFinite(value.duration) && value.duration >= 0 && typeof value.positionKnown === 'boolean';
}
export function newerProgress(a: ContentProgress, b?: ContentProgress) {
  return !b || a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.revision > b.revision);
}
function clean(value: any) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key,row]) => validContentProgress(row) && key === progressKey((row as ContentProgress).kind,(row as ContentProgress).id))) as Record<string, ContentProgress>;
}
/** Qualified local outbox + server-confirmed, last-change-wins reconciliation. */
export function createContentProgressEngine(deps: Dependencies) {
  const now = deps.now || Date.now;
  const states = new Map<string, State>(), loads = new Map<string, Promise<State>>(), queues = new Map<string, Promise<any>>(), syncs = new Map<string, Promise<void>>();
  const listeners = new Map<string, Set<(snapshot: ProgressSnapshot) => void>>();
  function key(scope: ProgressScope) {
    if (!scope.uid || !Number.isSafeInteger(scope.profileId) || scope.profileId <= 0) throw Error('Selecciona tu cuenta y perfil.');
    return `pixel_content_progress_v1:${encodeURIComponent(scope.uid)}:${scope.profileId}`;
  }
  function snapshot(state: State): ProgressSnapshot { return { records: Object.fromEntries(Object.entries(state.records).map(([key,row])=>[key,{...row}])), pendingCount: Object.keys(state.pending).length, pendingKeys:Object.keys(state.pending), lastSyncedAt: state.lastSyncedAt, syncing: state.syncing, failed: state.failed }; }
  function emit(scope: ProgressScope, state: State) { for (const fn of listeners.get(key(scope)) || []) fn(snapshot(state)); }
  async function load(scope: ProgressScope): Promise<State> {
    deps.assertScope(scope);
    const id = key(scope);
    if (states.has(id)) return states.get(id)!;
    if (!loads.has(id)) loads.set(id, (async () => {
      const raw=await deps.storage.getItem(id);
      let stored: any;
      try { stored=JSON.parse(raw||'{}'); } catch {
        // Preserve unreadable bytes; an I/O failure must never turn an outbox into an empty one.
        await deps.storage.setItem(`${id}:corrupt-${now()}`,raw!); stored={};
      }
      if(!stored||typeof stored!=='object')stored={};
      deps.assertScope(scope);
      const state: State = { records: clean(stored.records), pending: clean(stored.pending), lastSyncedAt: Number(stored.lastSyncedAt) || 0, syncing: false, failed: false };
      for (const [entry, row] of Object.entries(state.pending)) if (newerProgress(row,state.records[entry])) state.records[entry] = row;
      states.set(id,state); return state;
    })().catch(error => { loads.delete(id); throw error; }));
    return loads.get(id)!;
  }
  function enqueue<T>(scope: ProgressScope, action: (state: State) => Promise<T> | T): Promise<T> {
    const id = key(scope);
    const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
      const state = await load(scope); deps.assertScope(scope);
      const result = await action(state);
      try { await deps.storage.setItem(id,JSON.stringify({ records: state.records, pending: state.pending, lastSyncedAt: state.lastSyncedAt })); }
      catch(error) { state.failed=true; emit(scope,state); throw error; }
      emit(scope,state); return result;
    });
    queues.set(id,task); return task;
  }
  function merge(state: State, remote: Record<string, ContentProgress>, confirmed: boolean) {
    for (const [id,row] of Object.entries(clean(remote))) {
      if (newerProgress(row,state.records[id])) state.records[id] = row;
      if (confirmed && state.pending[id] && !newerProgress(state.pending[id],row)) delete state.pending[id];
    }
  }
  const api = {
    async read(scope: ProgressScope) { return snapshot(await load(scope)); },
    subscribe(scope: ProgressScope, fn: (snapshot: ProgressSnapshot) => void) {
      const id=key(scope); if (!listeners.has(id)) listeners.set(id,new Set()); listeners.get(id)!.add(fn);
      void load(scope).then(state => { if (listeners.get(id)?.has(fn)) fn(snapshot(state)); }).catch(() => {});
      return () => { listeners.get(id)?.delete(fn); };
    },
    acceptRemote(scope: ProgressScope, rows: Record<string, ContentProgress>, confirmed: boolean) {
      return enqueue(scope,state => { merge(state,rows,confirmed); if (confirmed && !Object.keys(state.pending).length) { state.lastSyncedAt=now(); state.failed=false; } });
    },
    async save(scope: ProgressScope, kind: ProgressKind, id: string, input: Partial<ContentProgress>) {
      await enqueue(scope,state => {
        const entry=progressKey(kind,id), previous=state.records[entry];
        const value={ ...input, kind, id, updatedAt: Math.max(now(),(previous?.updatedAt || 0)+1), revision: `${now().toString(36)}-${Math.random().toString(36).slice(2)}` } as ContentProgress;
        // An opaque provider marker must not erase a known minute of the same episode.
        if (kind==='h_anime' && previous?.episodeNumber===value.episodeNumber && previous.positionKnown && !value.positionKnown) {
          value.currentTime=previous.currentTime; value.duration=previous.duration; value.positionKnown=true;
        }
        if (!validContentProgress(value)) throw Error('Avance inválido.');
        state.records[entry]=value; state.pending[entry]=value;
      });
      void api.sync(scope).catch(() => {});
    },
    async importRows(scope: ProgressScope, rows: ContentProgress[]) {
      await enqueue(scope,state => {
        for (const row of rows) {
          if (!validContentProgress(row)) continue;
          const id=progressKey(row.kind,row.id);
          if (newerProgress(row,state.records[id])) { state.records[id]=row; state.pending[id]=row; }
        }
      });
      await api.sync(scope);
    },
    sync(scope: ProgressScope): Promise<void> {
      const id=key(scope); if (syncs.has(id)) return syncs.get(id)!;
      const task=(async () => {
        await enqueue(scope,state => { state.syncing=true; state.failed=false; });
        try {
          const remote=await deps.remote.read(scope);
          let pending=await enqueue(scope,state => { merge(state,remote,true); return Object.values(state.pending); });
          // Drain changes arriving during a write; bound continuous playback work per pass.
          for(let pass=0;pending.length&&pass<3;pass++) {
            const confirmed=await deps.remote.write(scope,pending);
            pending=await enqueue(scope,state => { merge(state,confirmed,true); return Object.values(state.pending); });
          }
          await enqueue(scope,state => { if(!Object.keys(state.pending).length) {state.lastSyncedAt=now();state.failed=false;} });
        } catch (error) {
          await enqueue(scope,state => { state.failed=true; }).catch(() => {});
          throw error;
        } finally {
          await enqueue(scope,state => { state.syncing=false; }).catch(() => {});
        }
      })();
      syncs.set(id,task);
      task.finally(() => { if (syncs.get(id)===task) syncs.delete(id); }).catch(() => {});
      return task;
    },
  };
  return api;
}
