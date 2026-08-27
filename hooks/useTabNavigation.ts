import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

export function useTabNavigation() {
  const navigation = useNavigation<any>();

  const navigateToTab = useCallback((tabName: string) => {
    try {
      navigation.navigate(tabName);
    } catch (e) {
      console.log('Navigation failed', e);
    }
  }, [navigation]);

  const navigateByLabel = useCallback((label: string) => {
    const labelToRoute: Record<string, { tab: string; screen?: string }> = {
      'Inicio': { tab: 'Inicio', screen: 'HomeMain' },
      'Noticias': { tab: 'Noticias', screen: 'NoticiasHome' },
      'Emisión': { tab: 'Emisión' },
      'Manga': { tab: 'Manga', screen: 'MangaHome' },
      'Mi Lista': { tab: 'MiLista' },
      'Buscar': { tab: 'Buscar' },
      'Perfil': { tab: 'Perfil' },
    };
    
    const route = labelToRoute[label];
    if (route) {
      if (route.screen) {
        navigation.navigate(route.tab, { screen: route.screen });
      } else {
        navigation.navigate(route.tab);
      }
    }
  }, [navigation]);

  return { navigateToTab, navigateByLabel };
}
