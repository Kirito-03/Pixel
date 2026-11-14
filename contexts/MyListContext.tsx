import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useProfile } from './ProfileContext';
import { useAuth } from './AuthContext';
import { myListApi, MyListContentType } from '../services/myListApi';

interface MyListContextType {
  myListItems: Set<string>;
  isInMyList: (id: string | number, type?: MyListContentType) => boolean;
  isUpdatingMyList: (id: string | number, type?: MyListContentType) => boolean;
  addToMyList: (id: string | number, type?: MyListContentType) => Promise<void>;
  removeFromMyList: (id: string | number, type?: MyListContentType) => Promise<void>;
  toggleMyList: (id: string | number, type?: MyListContentType) => Promise<void>;
  refreshMyList: () => Promise<void>;
  loading: boolean;
}
const MyListContext = createContext<MyListContextType | undefined>(undefined);
const EMPTY = new Set<string>();

export function MyListProvider({ children }: { children: ReactNode }) {
  const { currentProfile, adultContentEnabled } = useProfile();
  const { user, isLoading: authLoading } = useAuth();
  const profileId = currentProfile?.id ?? null;
  const scope = `${user?.uid}:${profileId}:${adultContentEnabled}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [state, setState] = useState({ scope, items: EMPTY });
  const itemsRef = useRef(state);
  itemsRef.current = state;
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(new Set<string>());
  const operations = useRef(new Map<string, Promise<void>>());
  const revision = useRef(0);
  const reads = useRef(0);
  const myListItems = state.scope === scope ? state.items : EMPTY;

  const refreshMyList = async () => {
    const request = ++reads.current;
    if (!profileId || !user?.uid || authLoading) { setState({ scope, items: EMPTY }); setLoading(false); return; }
    const started = revision.current;
    setLoading(true);
    try {
      const entries = await myListApi.getMyList(profileId, { includeAdult: adultContentEnabled });
      if (currentScope.current !== scope || request !== reads.current || revision.current !== started) return;
      setState({ scope, items: new Set(entries.map(entry => `${entry.content_type}:${entry.content_id}`)) });
    } finally {
      if (currentScope.current === scope && request === reads.current) setLoading(false);
    }
  };
  useEffect(() => { refreshMyList().catch(() => {}); }, [scope, authLoading]);

  const isInMyList = (id: string | number, type: MyListContentType = 'movie') => myListItems.has(`${type}:${id}`);
  const isUpdatingMyList = (id: string | number, type: MyListContentType = 'movie') => pending.has(`${scope}:${type}:${id}`);
  const mutate = (id: string | number, type: MyListContentType, action: 'add' | 'remove' | 'toggle'): Promise<void> => {
    if (!profileId || !user?.uid || authLoading) return Promise.reject(new Error('Selecciona un perfil antes de guardar títulos'));
    if (type === 'h_anime' && !adultContentEnabled) return Promise.reject(new Error('Esta sección está deshabilitada en tu perfil'));
    const key = `${type}:${id}`;
    const operationKey = `${scope}:${key}`;
    const existing = operations.current.get(operationKey);
    if (existing) return existing;
    const saved = itemsRef.current.scope === scope && itemsRef.current.items.has(key);
    const adding = action === 'add' || (action === 'toggle' && !saved);
    revision.current += 1;
    setPending(previous => new Set([...previous, operationKey]));
    const operation = Promise.resolve().then(async () => {
      if (adding) await myListApi.add(profileId, id, type);
      else await myListApi.remove(profileId, id, type);
      if (currentScope.current !== scope) return;
      setState(previous => {
        const items = new Set(previous.scope === scope ? previous.items : []);
        if (adding) items.add(key); else items.delete(key);
        return { scope, items };
      });
    }).finally(() => {
      revision.current += 1;
      operations.current.delete(operationKey);
      setPending(previous => { const next = new Set(previous); next.delete(operationKey); return next; });
    });
    operations.current.set(operationKey, operation);
    return operation;
  };
  const value: MyListContextType = {
    myListItems, isInMyList, isUpdatingMyList, loading, refreshMyList,
    addToMyList: (id, type = 'movie') => mutate(id, type, 'add'),
    removeFromMyList: (id, type = 'movie') => mutate(id, type, 'remove'),
    toggleMyList: (id, type = 'movie') => mutate(id, type, 'toggle'),
  };
  return <MyListContext.Provider value={value}>{children}</MyListContext.Provider>;
}
export function useMyList(): MyListContextType {
  const value = useContext(MyListContext);
  if (!value) throw new Error('useMyList must be used within a MyListProvider');
  return value;
}
