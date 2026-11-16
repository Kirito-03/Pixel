import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { catalogService } from '../services/catalogService';
import { animeSearchResult } from '../services/universalSearch';
import type { ContentItem } from '../types';

// React Navigation owns the query string; every catalog entry point shares this recovery path.
export function useAnimeDetailLocation(input: ContentItem | null, inputVisible: boolean, requestClose: () => void) {
 const route = useRoute<any>(), navigation = useNavigation<any>(), focused = useIsFocused();
 const [restored, setRestored] = useState<ContentItem | null>(null);
 const [selection, setSelection] = useState<{ sourceId: number; item: ContentItem } | null>(null);
 const closing = useRef<number | null>(null);
 const raw = route.params?.anime;
 const id = /^\d+$/.test(String(raw || '')) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
 useEffect(() => {
  if (Platform.OS !== 'web' || !focused || inputVisible || !id || closing.current === id) return;
  if (Number(restored?.id) === id) return;
  let active = true;
  catalogService.getAnimeById(id).then(anime => { if (active) setRestored(animeSearchResult(anime).content); })
   .catch(() => { if (active) { setRestored(null); navigation.setParams({ anime: undefined }); } });
  return () => { active = false; };
 }, [id, inputVisible, focused, restored?.id]);
 useEffect(() => { if (!id) setRestored(null); }, [id]);
 if (!id) closing.current = null;
 const currentRestored = restored && Number(restored.id) === id ? restored : null;
 return {
  restoring: Platform.OS === 'web' && focused && !!id && closing.current !== id && !inputVisible && !currentRestored,
  content: inputVisible ? (selection && selection.sourceId === input?.id && (Platform.OS !== 'web' || id === Number(selection.item.id)) ? selection.item : input) : currentRestored || input,
  visible: focused && (inputVisible || !!currentRestored),
  onContentChange: (item: ContentItem) => { setRestored(item); if (input) setSelection({ sourceId: input.id, item }); if (Platform.OS === 'web') navigation.setParams({ anime: item.id }); },
  onClose: () => { closing.current = id; setRestored(null); setSelection(null); if (Platform.OS === 'web') navigation.setParams({ anime: undefined }); requestClose(); },
 };
}
