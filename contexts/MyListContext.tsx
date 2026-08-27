import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useProfile } from './ProfileContext';
import { myListApi } from '../services/myListApi';

interface MyListContextType {
  // Guardamos claves compuestas con el tipo para evitar colisiones entre TMDB y AniList
  myListItems: Set<string>;
  isInMyList: (contentId: string | number, contentType?: 'movie' | 'tv' | 'anime' | 'manga') => boolean;
  addToMyList: (contentId: string | number, contentType?: 'movie' | 'tv' | 'anime' | 'manga') => Promise<void>;
  removeFromMyList: (contentId: string | number, contentType?: 'movie' | 'tv' | 'anime' | 'manga') => Promise<void>;
  toggleMyList: (contentId: string | number, contentType?: 'movie' | 'tv' | 'anime' | 'manga') => Promise<void>;
  refreshMyList: () => Promise<void>;
  loading: boolean;
}

const MyListContext = createContext<MyListContextType | undefined>(undefined);

interface MyListProviderProps {
  children: ReactNode;
}

export const MyListProvider: React.FC<MyListProviderProps> = ({ children }) => {
  const { currentProfile } = useProfile();
  const [myListItems, setMyListItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentProfile) {
      refreshMyList();
    } else if (!currentProfile) {
      setMyListItems(new Set());
    }
  }, [currentProfile]);

  const refreshMyList = async () => {
    if (!currentProfile) return;

    setLoading(true);
    try {
      const entries = await myListApi.getMyList(currentProfile.id);
      const keyed = new Set<string>(
        entries.map((entry: { content_id: string | number; content_type: 'movie' | 'tv' | 'anime' | 'manga' }) => {
          const type = entry.content_type;
          return `${type}:${entry.content_id}`;
        })
      );
      setMyListItems(keyed);
    } catch (error) {
      setMyListItems(new Set<string>());
    } finally {
      setLoading(false);
    }
  };

  const isInMyList = (contentId: string | number, contentType: 'movie' | 'tv' | 'anime' | 'manga' = 'movie'): boolean => {
    const key = `${contentType}:${contentId}`;
    return myListItems.has(key);
  };

  const addToMyList = async (contentId: string | number, contentType: 'movie' | 'tv' | 'anime' | 'manga' = 'movie') => {
    if (!currentProfile) {
      throw new Error('No hay perfil seleccionado');
    }

    try {
      await myListApi.add(currentProfile.id, contentId, contentType);
      const key = `${contentType}:${contentId}`;
      setMyListItems((prev) => new Set<string>([...prev, key]));
    } catch (error) {
      throw error;
    }
  };

  const removeFromMyList = async (contentId: string | number, contentType: 'movie' | 'tv' | 'anime' | 'manga' = 'movie') => {
    if (!currentProfile) {
      throw new Error('No hay perfil seleccionado');
    }

    try {
      await myListApi.remove(currentProfile.id, contentId, contentType);
      setMyListItems((prev) => {
        const next = new Set(prev);
        next.delete(`${contentType}:${contentId}`);
        return next;
      });
    } catch (error) {
      throw error;
    }
  };

  const toggleMyList = async (contentId: string | number, contentType: 'movie' | 'tv' | 'anime' | 'manga' = 'movie') => {
    if (!currentProfile) {
      return;
    }

    const isCurrentlyInList = isInMyList(contentId, contentType);

    try {
      if (isCurrentlyInList) {
        await removeFromMyList(contentId, contentType);
      } else {
        await addToMyList(contentId, contentType);
      }
    } catch (error) {
      throw error;
    }
  };

  const value: MyListContextType = {
    myListItems,
    isInMyList,
    addToMyList,
    removeFromMyList,
    toggleMyList,
    refreshMyList,
    loading,
  };

  return (
    <MyListContext.Provider value={value}>
      {children}
    </MyListContext.Provider>
  );
};

export const useMyList = (): MyListContextType => {
  const context = useContext(MyListContext);
  if (context === undefined) {
    throw new Error('useMyList must be used within a MyListProvider');
  }
  return context;
};
