import React, { useEffect, Suspense } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Storage } from '../services/storage';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ProfileSelectionScreen from '../screens/ProfileSelectionScreen';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CategoryScreen from '../screens/CategoryScreen';
import MyListScreen from '../screens/MyListScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import NewsScreen from '../screens/NewsScreen';
import NewsDetailScreen from '../screens/NewsDetailScreen';
import MangaScreen from '../screens/MangaScreen';
import MangaDetailScreen from '../screens/MangaDetailScreen';
import MangaReaderScreen from '../screens/MangaReaderScreen';
import AppearanceScreen from '../screens/AppearanceScreen';
import AiringScreen from '../screens/AiringScreen';
import LegalScreen from '../screens/LegalScreen';

// ── Admin Screens: code-split on web, static on native ─────────
// React.lazy only works on web (React DOM). On native, React Native
// doesn't support React.lazy with Suspense for code splitting,
// so we import statically.
let AdminLoginScreen: React.ComponentType<any>;
let AdminDashboardScreen: React.ComponentType<any>;
let AdminImportScreen: React.ComponentType<any>;
let AnimeListScreen: React.ComponentType<any>;
let AnimeFormScreen: React.ComponentType<any>;
let EpisodeManagerScreen: React.ComponentType<any>;
let AdminBotScreen: React.ComponentType<any>;

if (Platform.OS === 'web') {
  // Web: lazy-load admin screens → separate JS chunks
  // Users who never navigate to Admin won't download this code.
  AdminLoginScreen = React.lazy(() => import('../screens/admin/AdminLoginScreen'));
  AdminDashboardScreen = React.lazy(() => import('../screens/admin/AdminDashboardScreen'));
  AdminImportScreen = React.lazy(() => import('../screens/admin/AdminImportScreen'));
  AnimeListScreen = React.lazy(() => import('../screens/admin/AnimeListScreen'));
  AnimeFormScreen = React.lazy(() => import('../screens/admin/AnimeFormScreen'));
  EpisodeManagerScreen = React.lazy(() => import('../screens/admin/EpisodeManagerScreen'));
  AdminBotScreen = React.lazy(() => import('../screens/admin/AdminBotScreen'));
} else {
  // Native: static imports (no code splitting support)
  AdminLoginScreen = require('../screens/admin/AdminLoginScreen').default;
  AdminDashboardScreen = require('../screens/admin/AdminDashboardScreen').default;
  AdminImportScreen = require('../screens/admin/AdminImportScreen').default;
  AnimeListScreen = require('../screens/admin/AnimeListScreen').default;
  AnimeFormScreen = require('../screens/admin/AnimeFormScreen').default;
  EpisodeManagerScreen = require('../screens/admin/EpisodeManagerScreen').default;
  AdminBotScreen = require('../screens/admin/AdminBotScreen').default;
}

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { useAdmin } from '../contexts/AdminContext';
import { LoadingScreen } from '../components/LoadingScreen';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const AdminStack = createNativeStackNavigator();
const NewsStack = createNativeStackNavigator();
const MangaStack = createNativeStackNavigator();

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen as any} />
      <HomeStack.Screen name="Categoria" component={CategoryScreen as any} />
    </HomeStack.Navigator>
  );
}

function AdminNavigator() {
  const content = (
    <AdminStack.Navigator 
      initialRouteName="AdminDashboard"
      screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}
    >
      <AdminStack.Screen name="AdminLogin" component={AdminLoginScreen as any} />
      <AdminStack.Screen name="AdminDashboard" component={AdminDashboardScreen as any} />
      <AdminStack.Screen name="AdminImport" component={AdminImportScreen as any} />
      <AdminStack.Screen name="AnimeList" component={AnimeListScreen as any} />
      <AdminStack.Screen name="AnimeForm" component={AnimeFormScreen as any} />
      <AdminStack.Screen name="EpisodeManager" component={EpisodeManagerScreen as any} />
      <AdminStack.Screen name="AdminBot" component={AdminBotScreen as any} />
    </AdminStack.Navigator>
  );

  // Wrap in Suspense on web for lazy-loaded admin screens
  if (Platform.OS === 'web') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        {content}
      </Suspense>
    );
  }

  return content;
}

function NewsNavigator() {
  return (
    <NewsStack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}>
      <NewsStack.Screen name="NoticiasHome" component={NewsScreen as any} />
      <NewsStack.Screen name="NewsDetail" component={NewsDetailScreen as any} />
    </NewsStack.Navigator>
  );
}

function MangaNavigator() {
  return (
    <MangaStack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}>
      <MangaStack.Screen name="MangaHome" component={MangaScreen as any} />
      <MangaStack.Screen name="MangaDetail" component={MangaDetailScreen as any} />
      <MangaStack.Screen name="MangaReader" component={MangaReaderScreen as any} />
    </MangaStack.Navigator>
  );
}

function MainTabs({ route }: { route: any }) {
  const { colors } = useTheme();
  const { selectedProfile, userId } = route.params || {};
  const { isAdmin } = useAdmin();
  const insets = useSafeAreaInsets();

  const { setCurrentProfile, currentProfile } = useProfile();

  // Establecer el perfil seleccionado cuando se monta el componente
  React.useEffect(() => {
    if (!selectedProfile) {
      if (!currentProfile) {
        console.log('MainTabs: No profile found, should redirect to ProfileSelection');
      }
      return;
    }

    // Si no hay perfil en contexto aún, establecer el seleccionado
    if (!currentProfile) {
      console.log('MainTabs: No currentProfile; setting from selectedProfile ID:', selectedProfile.id);
      setCurrentProfile(selectedProfile);
      return;
    }

    // Si el ID difiere, cambiar de perfil
    if (selectedProfile.id !== currentProfile.id) {
      console.log('MainTabs: Different profile id; switching:', {
        fromId: currentProfile.id,
        toId: selectedProfile.id,
      });
      setCurrentProfile(selectedProfile);
      return;
    }

    // Mismo perfil: evitar sobreescribir datos más recientes del contexto (ej. avatar actualizado)
    if (selectedProfile.avatar_url !== currentProfile.avatar_url) {
      console.log('MainTabs: Same profile id; keeping current avatar (ID:', currentProfile.id, ')');
      return;
    }

    // Mismo perfil y misma info; no hacer nada
    console.log('MainTabs: Profile already set and matches selectedProfile. No action.');
  }, [selectedProfile, currentProfile, setCurrentProfile]);

  // En web el Header ya proporciona navegación; en nativo necesitamos el tab bar
  const isWeb = Platform.OS === 'web';
  const hideTabBar = isWeb ? { display: 'none' as const } : undefined;

  // Estilo premium del tab bar para Android/iOS
  const tabBarBaseStyle = isWeb
    ? { display: 'none' as const }
    : {
        backgroundColor: '#0a0a0a',
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
        borderTopWidth: 1,
        height: Platform.OS === 'android' ? 60 + insets.bottom : 85,
        paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 8) : 28,
        paddingTop: 8,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabBarBaseStyle,
        tabBarActiveTintColor: '#E50914',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={HomeNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'Inicio',
        }}
      />
      {Platform.OS === 'web' && (
        <Tab.Screen
          name="Buscar"
          component={SearchScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
            ),
            tabBarLabel: 'Buscar',
          }}
        />
      )}
      <Tab.Screen
        name="Noticias"
        component={NewsNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'newspaper' : 'newspaper-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'Noticias',
        }}
      />
      <Tab.Screen
        name="Emisión"
        component={AiringScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'En Emisión',
        }}
      />
      <Tab.Screen
        name="Manga"
        component={MangaNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'Manga',
        }}
      />
      <Tab.Screen
        name="MiLista"
        component={MyListScreen as any}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'Mi Lista',
        }}
      />
      {Platform.OS === 'web' && (
        <Tab.Screen
          name="Perfil"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} />
            ),
            tabBarLabel: 'Perfil',
          }}
        />
      )}

    </Tab.Navigator>
  );
}

const linking = {
  prefixes: ['https://pixelnosekai.art', 'pixelnosekai://'],
  config: {
    screens: {
      Ingreso: 'login',
      Registro: 'register',
      SeleccionPerfil: 'profiles',
      Principal: {
        screens: {
          Inicio: 'home',
          Buscar: 'search',
          Noticias: 'news',
          Emisión: 'airing',
          Manga: 'manga',
          MiLista: 'mylist',
          Perfil: 'profile',
        },
      },
      Apariencia: 'appearance',
      Descargas: 'downloads',
      Admin: {
        screens: {
          AdminLogin: 'admin/login',
          AdminDashboard: 'admin/dashboard',
          AdminImport: 'admin/import',
          AnimeList: 'admin/anime',
          AnimeForm: 'admin/anime/form',
          EpisodeManager: 'admin/episodes',
          AdminBot: 'admin/bot',
        }
      }
    }
  }
};

export default function AppNavigator() {
  const { colors } = useTheme();
  const { user, isLoading } = useAuth();
  const { currentProfile, loadCurrentProfile } = useProfile();
  const { isAdmin } = useAdmin();
  const [initialRoute, setInitialRoute] = React.useState<string | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [initialState, setInitialState] = React.useState();

  // Load navigation state on mount
  useEffect(() => {
    const restoreState = async () => {
      try {
        const savedStateString = Storage.getString('NAVIGATION_STATE');
        const state = savedStateString ? JSON.parse(savedStateString) : undefined;

        if (state !== undefined) {
          setInitialState(state);
        }
      } catch (e) {
        console.error('Error loading navigation state:', e);
      } finally {
        setIsReady(true);
      }
    };

    if (!isReady) {
      restoreState();
    }
  }, [isReady]);

  useEffect(() => {
    const determineInitialRoute = async () => {
      // Must wait for Auth AND Persistence to be ready
      if (isLoading || !isReady) {
        return;
      }

      // 1. If we have a restored state, prioritize it!
      if (initialState) {
        // If user is logged out but state is for internal screens, React Nav might handle it 
        // by resetting to restricted screens, or we should verify user.
        // For now, assuming if user exists, state is valid.
        if (user) {
          console.log('AppNavigator: Using restored state');
          setInitialRoute('RESTORED_STATE');
          return;
        }
        // If no user, we ignore state and force Login
      }

      if (!user) {
        // Delay mínimo para mostrar animación de carga
        setTimeout(() => setInitialRoute('Ingreso'), 2000);
        return;
      }

      // Si hay usuario, verificar si hay perfil guardado
      const loadedProfile = await loadCurrentProfile();

      // OPTIMIZACIÓN: Si ya tenemos usuario, no necesitamos un delay largo
      if (loadedProfile) {
        // Si hay perfil guardado, ir directamente a Principal
        setInitialRoute('Principal');
      } else {
        // Si no hay perfil, ir a selección de perfil
        setInitialRoute('SeleccionPerfil');
      }
    };

    determineInitialRoute();
  }, [user, isLoading, isReady, initialState]);

  // Mostrar loading mientras se determina la ruta inicial
  if (isLoading || !isReady || initialRoute === null) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer
      linking={linking}
      initialState={initialState}
      onStateChange={(state) => {
        Storage.setObject('NAVIGATION_STATE', state);
      }}
    >
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          presentation: 'card',
        }}
        initialRouteName={initialRoute === 'RESTORED_STATE' ? undefined : initialRoute}
      >
        {!user ? (
          <>
            <RootStack.Screen name="Ingreso" component={LoginScreen} />
            <RootStack.Screen name="Registro" component={RegisterScreen} />
            <RootStack.Screen name="LegalScreen" component={LegalScreen} />
          </>
        ) : (
          <>
            <RootStack.Screen
              name="SeleccionPerfil"
              component={ProfileSelectionScreen as any}
            />
            <RootStack.Screen name="Principal" component={MainTabs} />
            {Platform.OS !== 'web' && (
              <>
                <RootStack.Screen name="Buscar" component={SearchScreen} />
                <RootStack.Screen name="Perfil" component={ProfileScreen} />
              </>
            )}
            <RootStack.Screen name="Apariencia" component={AppearanceScreen} />
            <RootStack.Screen name="Descargas" component={DownloadsScreen as any} />
            <RootStack.Screen name="LegalScreen" component={LegalScreen} />
            {isAdmin && <RootStack.Screen name="Admin" component={AdminNavigator} />}
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
