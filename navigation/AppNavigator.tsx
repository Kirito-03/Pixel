import { ReaderChromeProvider, useReaderChrome } from '../contexts/ReaderChromeContext';
import ReaderTabBar from '../components/ReaderTabBar';
import { profileNavigationScreens } from '../utils/profileNavigation';
import React, { useEffect, Suspense } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme, type LinkingOptions, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import NSFWScreen from '../screens/NSFWScreen';
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
import LoadingScreen from '../components/LoadingScreen';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const AdminStack = createNativeStackNavigator();
const NewsStack = createNativeStackNavigator();
const MangaStack = createNativeStackNavigator();

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen as any} options={{ title: 'Pixel - Inicio' }} />
      <HomeStack.Screen name="Categoria" component={CategoryScreen as any} options={{ title: 'Pixel - Categoría' }} />
    </HomeStack.Navigator>
  );
}

function AdminNavigator() {
  const content = (
    <AdminStack.Navigator
      initialRouteName="AdminDashboard"
      screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}
    >
      <AdminStack.Screen name="AdminLogin" component={AdminLoginScreen as any} options={{ title: 'Pixel - Admin Login' }} />
      <AdminStack.Screen name="AdminDashboard" component={AdminDashboardScreen as any} options={{ title: 'Pixel - Dashboard' }} />
      <AdminStack.Screen name="AdminImport" component={AdminImportScreen as any} options={{ title: 'Pixel - Importar' }} />
      <AdminStack.Screen name="AnimeList" component={AnimeListScreen as any} options={{ title: 'Pixel - Catálogo Admin' }} />
      <AdminStack.Screen name="AnimeForm" component={AnimeFormScreen as any} options={{ title: 'Pixel - Editar Anime' }} />
      <AdminStack.Screen name="EpisodeManager" component={EpisodeManagerScreen as any} options={{ title: 'Pixel - Gestor de Episodios' }} />
      <AdminStack.Screen name="AdminBot" component={AdminBotScreen as any} options={{ title: 'Pixel - Bot Inteligente' }} />
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
      <NewsStack.Screen name="NoticiasHome" component={NewsScreen as any} options={{ title: 'Pixel - Noticias' }} />
      <NewsStack.Screen name="NewsDetail" component={NewsDetailScreen as any} options={{ title: 'Pixel - Detalle Noticia' }} />
    </NewsStack.Navigator>
  );
}

function MangaNavigator() {
  return (
    <MangaStack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'default' }}>
      <MangaStack.Screen name="MangaHome" component={MangaScreen as any} options={{ title: 'Pixel - Mangas' }} />
      <MangaStack.Screen name="MangaDetail" component={MangaDetailScreen as any} options={{ title: 'Pixel - Detalle Manga' }} />
      <MangaStack.Screen name="MangaReader" component={MangaReaderScreen as any} options={{ title: 'Pixel - Lector Manga' }} />
    </MangaStack.Navigator>
  );
}

function MainTabs({ route }: { route: any }) {
  return <ReaderChromeProvider><MainTabsContent route={route} /></ReaderChromeProvider>;
}

function MainTabsContent({ route }: { route: any }) {
  const { reading } = useReaderChrome();
  const { colors } = useTheme();
  const { selectedProfile, userId } = route.params || {};
  const { isAdmin } = useAdmin();
  const insets = useSafeAreaInsets();

  const { setCurrentProfile, currentProfile, adultContentEnabled } = useProfile();

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

  // En web grande el Header proporciona navegación; en web chica y en nativo necesitamos el tab bar
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const isSmallWeb = isWeb && width < 768;

  // Estilo premium del tab bar para Android/iOS y Web Móvil
  const tabBarBaseStyle = (isWeb && !isSmallWeb)
    ? { display: 'none' as const }
    : {
        backgroundColor: colors.card,
        borderTopColor: colors.divider,
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
      tabBar={props => <ReaderTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: [tabBarBaseStyle, !isWeb && reading ? { position: 'absolute' } : null],
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
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
      <Tab.Screen
          name="Buscar"
          component={SearchScreen}
          options={{
            title: 'Pixel - Buscar',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
            ),
            tabBarLabel: 'Buscar',
          }}
        />
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
          title: 'Pixel - Emisión',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'En Emisión',
        }}
      />

      {adultContentEnabled && (
        <Tab.Screen
          name="Hentai"
          component={NSFWScreen}
          options={{
            title: 'Pixel - H Anime',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'flame' : 'flame-outline'} size={22} color={color} />
            ),
            tabBarLabel: 'Hentai',
          }}
        />
      )}

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
          title: 'Pixel - Mi Lista',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={22} color={color} />
          ),
          tabBarLabel: 'Mi Lista',
        }}
      />
      {/* Perfil solo en web — en Android se accede desde el avatar del Header */}
      {Platform.OS === 'web' && (
        <Tab.Screen
          name="Perfil"
          component={ProfileScreen}
          options={{
            title: 'Pixel - Mi Perfil',
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

type LinkRoutes = {
  Ingreso: undefined;
  Registro: undefined;
  SeleccionPerfil: undefined;
  Apariencia: undefined;
  Descargas: undefined;
  LegalScreen: { type: 'terms' | 'privacy' };
  Principal: NavigatorScreenParams<{
    Inicio: undefined;
    Buscar: undefined;
    Emisión: undefined;
    Hentai: undefined;
    MiLista: undefined;
    Perfil: undefined;
    Noticias: NavigatorScreenParams<{ NoticiasHome: undefined; NewsDetail: { id: string } }>;
    Manga: NavigatorScreenParams<{
      MangaHome: undefined;
      MangaDetail: { id: string };
      MangaReader: { id: string; chapterId?: string; chapterKey?: string };
    }>;
  }>;
  Admin: NavigatorScreenParams<Record<'AdminLogin' | 'AdminDashboard' | 'AdminImport' | 'AnimeList' | 'AnimeForm' | 'EpisodeManager' | 'AdminBot', undefined>>;
};

const linking: LinkingOptions<LinkRoutes> = {
  prefixes: ['https://pixelnosekai.com', 'pixelnosekai://'],
  config: {
    screens: {
      Ingreso: 'login',
      Registro: 'register',
      SeleccionPerfil: 'profiles',
      Principal: {
        screens: {
          Inicio: {
            path: 'home',
            screens: {
              HomeMain: { path: '', alias: ['HomeMain'] },
              Categoria: 'category',
            },
          },
          Buscar: 'search',
          Noticias: {
            path: 'news',
            screens: {
              NoticiasHome: '',
              NewsDetail: 'detail/:id'
            }
          },
          Emisión: 'airing',
          Manga: {
            path: 'manga',
            screens: {
              MangaHome: '',
              MangaDetail: 'detail/:id',
              MangaReader: { path: ':id/:chapterKey', alias: ['read/:id/:chapterId'] }
            }
          },
          Hentai: { path: 'h-anime', alias: ['Hentai', 'hentai'] },
          MiLista: 'mylist',
          Perfil: 'profile',
        },
      },
      Apariencia: 'appearance',
      Descargas: 'downloads',
      LegalScreen: 'legal/:type',
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
  const { colors, theme } = useTheme();
  const { user, isLoading } = useAuth();
  const { currentProfile, profileLoading } = useProfile();
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const activeLinking = React.useMemo(() => {
    const screens = profileNavigationScreens(linking.config!.screens as any, !!user, !!currentProfile, isAdmin);
    return { ...linking, config: { screens } };
  }, [!!user, !!currentProfile, isAdmin]);
  if (isLoading || profileLoading || (user && currentProfile && adminLoading)) return <LoadingScreen />;
  const initialRoute = !user ? 'Ingreso' : currentProfile ? 'Principal' : 'SeleccionPerfil';

  return (
    <NavigationContainer
      key={`${user?.uid || 'signed-out'}:${currentProfile?.id || 'choose-profile'}`}
      linking={activeLinking}
      theme={{ ...(theme === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(theme === 'dark' ? DarkTheme.colors : DefaultTheme.colors), background: colors.background, card: colors.card, text: colors.text, primary: colors.primary, border: colors.divider } }}
    >
      <RootStack.Navigator
        key={`${user?.uid || 'signed-out'}:${currentProfile?.id || 'choose-profile'}`}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          presentation: 'card',
          gestureEnabled: false,
        }}
        initialRouteName={initialRoute}
      >
        {!user ? (
          <>
            <RootStack.Screen name="Ingreso" component={LoginScreen} />
            <RootStack.Screen name="Registro" component={RegisterScreen} />
            <RootStack.Screen name="LegalScreen" component={LegalScreen} />
          </>
        ) : (
          <>
            {!currentProfile && <RootStack.Screen
              name="SeleccionPerfil"
              component={ProfileSelectionScreen as any}
            />}
            {currentProfile && <RootStack.Screen name="Principal" component={MainTabs} />}
            {currentProfile && Platform.OS !== 'web' && (
              <RootStack.Screen name="Perfil" component={ProfileScreen} />
            )}
            {currentProfile && <RootStack.Screen name="Apariencia" component={AppearanceScreen} />}
            {currentProfile && <RootStack.Screen name="Descargas" component={DownloadsScreen as any} />}
            <RootStack.Screen name="LegalScreen" component={LegalScreen} />
            {currentProfile && isAdmin && <RootStack.Screen name="Admin" component={AdminNavigator} />}
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
