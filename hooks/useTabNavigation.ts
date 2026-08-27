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
    const labelToRoute: Record<string, string> = {
      'Inicio': 'HomeMain',
      'Noticias': 'NoticiasHome',
      'Emisión': 'Emisión',
      'Manga': 'MangaHome',
      'Mi Lista': 'MiLista',
      'Buscar': 'Buscar',
      'Perfil': 'Perfil',
    };
    const routeName = labelToRoute[label];
    if (routeName) {
      navigation.navigate(routeName);
    }
  }, [navigation]);

  return { navigateToTab, navigateByLabel };
}
