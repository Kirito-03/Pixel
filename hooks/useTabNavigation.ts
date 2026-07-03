import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Platform } from 'react-native';

/**
 * Hook centralizado para navegar entre tabs desde cualquier nivel del navigator.
 *
 * Funciona tanto desde:
 * - Screens directas del Tab (NewsScreen, MangaScreen, etc.)
 * - Screens anidadas dentro de un Stack dentro de un Tab (HomeScreen dentro de HomeNavigator)
 *
 * Uso:
 *   const { navigateToTab } = useTabNavigation();
 *   navigateToTab('Inicio');
 */
export function useTabNavigation() {
  const navigation = useNavigation<any>();

  const navigateToTab = useCallback((tabName: string) => {
    // En nativo, 'Perfil' y 'Buscar' viven en el RootStack, no en tabs
    if (Platform.OS !== 'web' && (tabName === 'Perfil' || tabName === 'Buscar')) {
      try {
        // Escalar hasta el RootStack navigator
        let nav: any = navigation;
        while (nav) {
          try {
            nav.navigate('Perfil');
            return;
          } catch {
            nav = nav.getParent?.();
          }
        }
      } catch (e) {
        navigation.navigate('Perfil' as never);
      }
      return;
    }

    // Intentar con el navigator actual
    // Si falla, intentar con el parent (para stacks anidados)
    try {
      const state = navigation.getState();
      const isInsideTab =
        state?.type === 'tab' ||
        navigation.getParent()?.getState()?.type === 'tab';

      if (isInsideTab) {
        // Primero intentar desde el parent (para stacks dentro de tabs)
        const parent = navigation.getParent();
        if (parent && parent.getState()?.type === 'tab') {
          parent.navigate(tabName);
        } else if (state?.type === 'tab') {
          // Ya somos un tab directo
          navigation.navigate(tabName);
        } else {
          // Último recurso: escalar por los parents
          let nav = navigation.getParent();
          while (nav) {
            if (nav.getState()?.type === 'tab') {
              nav.navigate(tabName);
              return;
            }
            nav = nav.getParent?.();
          }
        }
      } else {
        navigation.navigate(tabName);
      }
    } catch (e) {
      // Fallback directo
      navigation.navigate(tabName as never);
    }
  }, [navigation]);

  /** Mapa de label de UI → nombre de tab en el navigator */
  const navigateByLabel = useCallback((label: string) => {
    const labelToTab: Record<string, string> = {
      'Inicio': 'Inicio',
      'Noticias': 'Noticias',
      'Emisión': 'Emisión',
      'Manga': 'Manga',
      'Mi Lista': 'MiLista',
      'Buscar': 'Buscar',
      'Perfil': 'Perfil',
    };
    const tabName = labelToTab[label];
    if (tabName) navigateToTab(tabName);
  }, [navigateToTab]);

  return { navigateToTab, navigateByLabel };
}
