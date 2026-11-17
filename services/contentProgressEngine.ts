export type ProgressKind = 'manga' | 'h_anime';
export type ProgressScope = { uid: string; profileId: number };
export type ContentProgress = {
  kind: ProgressKind; id: string; updatedAt: number; revision: string;
  chapterId?: string; chapterNumber?: string; readChapters?: string[]; episodeNumber?: number;
  currentTime?: number; duration?: number; positionKnown?: boolean;
};
export type ProgressSnapshot = { records: Record<string, ContentProgress>; pendingCount: number; pendingKeys: string[]; lastSyncedAt: number; syncing: boolean; failed: boolean };
type State = { records: Record<string, ContentProgress>; pending: Record<string, ContentProgress>; lastSyncedAt: number; syncing: boolean; failed: boolean };
type Dependencies = {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  remote: { read(scope: ProgressScope): Promise<Record<string, ContentProgress>>; write(scope: ProgressScope, rows: ContentProgress[]): Promise<Record<string, ContentProgress>> };
  assertScope(scope: ProgressScope): void; now?: () => number;
};
// Compact integer intervals keep long sequential readings small; unusual IDs use
// a stable fingerprint. Never infer earlier chapters from the last-read pointer.
const READ_LIMIT = 256;
function chapterReadKey(chapterId: string, chapterNumber?: string | null): string {
  const number = String(chapterNumber ?? '').trim().replace(',', '.');
  if (/^\d{1,7}(?:\.\d{1,6})?$/.test(number)) {
    const [whole,fraction='']=number.split('.');
    const tail=fraction.replace(/0+$/,'');
    return `n:${Number(whole)}${tail ? '.'+tail : ''}`;
  }
  let id = String(chapterId || '');
  for (let i=0;i<4;i++) { try { const decoded=decodeURIComponent(id); if(decoded===id)break; id=decoded; } catch { break; } }
  id=id.replace(/[?#].*$/, '').replace(/\/$/, '');
  let a=2166136261,b=5381;
  for(let i=0;i<id.length;i++){a=Math.imul(a^id.charCodeAt(i),16777619);b=Math.imul(b,33)^id.charCodeAt(i);}
  return `i:${(a>>>0).toString(36)}:${(b>>>0).toString(36)}`;
}
const validReadKey=(key:unknown):key is string=>typeof key==='string'&&/^(?:n:\d{1,7}(?:\.\d{1,6})?|r:\d{1,7}-\d{1,7}|i:[a-z0-9]{1,7}:[a-z0-9]{1,7})$/.test(key);
export function mergeReadChapters(...groups: (readonly string[] | undefined)[]): string[] {
  const intervals: number[][]=[],other=new Set<string>();
  for(const key of groups.flatMap(group=>group||[])) {
    if(!validReadKey(key))continue;
    if(key.startsWith('r:')){const [a,b]=key.slice(2).split('-').map(Number);if(a<=b)intervals.push([a,b]);}
    else if(key.startsWith('n:')&&Number.isInteger(Number(key.slice(2)))){const n=Number(key.slice(2));intervals.push([n,n]);}
    else other.add(key);
  }
  intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const merged:number[][]=[];
  for(const range of intervals){const last=merged[merged.length-1];if(last&&range[0]<=last[1]+1)last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
  // Bound fragmented/special histories as well as the shared Firestore document.
  const result=[...merged.map(([a,b])=>a===b?`n:${a}`:`r:${a}-${b}`),...Array.from(other).sort()];
  if(result.length>READ_LIMIT)throw Error('El historial tiene demasiados capítulos aislados. Se conservó el historial anterior.');
  return result;
}
type MangaReadState={chapterId?:string;chapterNumber?:string;readChapters?:string[]};
export function mangaReadChapters(row?:MangaReadState):string[]{
  return row?.chapterId?mergeReadChapters(row.readChapters,[chapterReadKey(row.chapterId,row.chapterNumber)]):[];
}
export function isMangaChapterRead(row:MangaReadState|null|undefined,chapterId:string,chapterNumber?:string|null):boolean {
  if(!row)return false;
  if(row.chapterId===chapterId)return true;
  const key=chapterReadKey(chapterId,chapterNumber),n=key.startsWith('n:')?Number(key.slice(2)):NaN;
  return mangaReadChapters(row).some(entry=>entry===key||(entry.startsWith('r:')&&Number.isInteger(n)&&(()=>{const [a,b]=entry.slice(2).split('-').map(Number);return n>=a&&n<=b;})()));
}
export function mergeContentProgress(a:ContentProgress,b?:ContentProgress):ContentProgress {
  const winner=newerProgress(a,b)?a:b!;
  if(a.kind!=='manga')return winner;
  return {...winner,readChapters:mergeReadChapters(mangaReadChapters(a),mangaReadChapters(b))};
}
function historyConfirmed(local:ContentProgress,remote:ContentProgress):boolean {
  if(local.kind!=='manga')return true;
  return JSON.stringify(mergeReadChapters(mangaReadChapters(local),mangaReadChapters(remote)))===JSON.stringify(mangaReadChapters(remote));
}

export function progressKey(kind: ProgressKind, id: string) { return `${kind}:${id}`; }
export function validContentProgress(value: any): value is ContentProgress {
  if (!value || !['manga','h_anime'].includes(value.kind) || typeof value.id !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(value.id) ||
      !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || typeof value.revision !== 'string' || value.revision.length > 100) return false;
  if (value.kind === 'manga') return typeof value.chapterId === 'string' && value.chapterId.length > 0 && value.chapterId.length <= 2048 &&
    typeof value.chapterNumber === 'string' && value.chapterNumber.length <= 64 &&
    (value.readChapters===undefined || (Array.isArray(value.readChapters)&&value.readChapters.length<=READ_LIMIT&&value.readChapters.every(validReadKey)));
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
  function snapshot(state: State): ProgressSnapshot { return { records: Object.fromEntries(Object.entries(state.records).map(([key,row])=>[key,{...row,...(row.readChapters ? {readChapters:[...row.readChapters]} : {})}])), pendingCount: Object.keys(state.pending).length, pendingKeys:Object.keys(state.pending), lastSyncedAt: state.lastSyncedAt, syncing: state.syncing, failed: state.failed }; }
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
      for (const [entry, row] of Object.entries(state.pending)) state.records[entry] = mergeContentProgress(row,state.records[entry]);
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
      state.records[id] = mergeContentProgress(row,state.records[id]);
      if (state.pending[id]) {
        if (confirmed && !newerProgress(state.pending[id],row) && historyConfirmed(state.pending[id],row)) delete state.pending[id];
        else state.pending[id]=mergeContentProgress(state.pending[id],state.records[id]);
      }
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
        if (kind==='manga') value.readChapters=mergeReadChapters(mangaReadChapters(previous),mangaReadChapters(value));
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
          const merged=mergeContentProgress(row,state.records[id]);
          if (newerProgress(row,state.records[id]) || !historyConfirmed(row,state.records[id] || row)) { state.records[id]=merged; state.pending[id]=merged; }
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
