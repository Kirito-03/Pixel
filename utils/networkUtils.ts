import { Platform } from 'react-native';
import { loadNetworkConfig, saveNetworkConfig } from './networkStorage';

/**
 * Define las URLs base candidatas para el servidor backend.
 * Esto es útil para desarrollo en diferentes entornos (emulador, dispositivo físico).
 */
// Lista base sin IPs específicas de una red privada
// Intenta derivar la IP LAN del host desde Expo en desarrollo
const deriveLanURLFromExpo = (): string => {
  try {
    // Cargar dinámicamente para evitar dependencia dura si no está instalado
    const Constants = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('expo-constants').default;
      } catch (_) {
        return null;
      }
    })();
    const hostUri = (Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;
    if (hostUri && typeof hostUri === 'string') {
      const host = hostUri.split(':')[0];
      if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        return `http://${host}:3001`;
      }
    }
  } catch (_) {
    // Ignorar errores de entorno
  }
  return '';
};

const BASE_CANDIDATES: string[] = [
  // IP de la laptop en la red local (PRIMERO para dispositivos físicos)
  'http://192.168.1.144:3001',
  // Intento de LAN usando datos de Expo (útil para dispositivo físico en la misma red)
  deriveLanURLFromExpo(),
  // Local en web/iOS simulador
  'http://localhost:3001',
  // Loopback explícito
  'http://127.0.0.1:3001',
  // Emulador Android accede al host con 10.0.2.2
  Platform.OS === 'android' ? 'http://10.0.2.2:3001' : '',
].filter(Boolean);


/**
 * Almacenamiento dinámico para la URL base actual.
 * Se inicializa con una URL por defecto y se puede actualizar dinámicamente.
 */
let currentBaseURL: string = (() => {
  const envBase = (process.env.EXPO_PUBLIC_SERVER_BASE_URL || '').trim();
  return envBase || BASE_CANDIDATES[0];
})();

/**
 * Devuelve las URLs candidatas para que otros módulos puedan probar la conexión.
 */
export const getCandidateBaseURLs = (): string[] => {
  // Incluir la URL actual (posiblemente cargada desde almacenamiento) primero
  const dynamic = currentBaseURL ? [currentBaseURL] : [];
  // Evitar duplicados manteniendo orden de preferencia
  const set = new Set<string>([...dynamic, ...BASE_CANDIDATES]);
  return Array.from(set);
};

/**
 * Construye una URL completa a partir de una ruta, usando la URL base actual.
 * @param path - La ruta a la que se quiere acceder (ej. '/videos/anime.m3u').
 */
export const buildServerURL = (path: string = ''): string => {
  // Asegurarse de que el path comience con una barra
  const formattedPath = path.startsWith('/') ? path : `/${path}`;
  return `${currentBaseURL}${formattedPath}`;
};

/**
 * Configuración de red dinámica que gestiona la URL base del servidor.
 * Incluye funciones para obtener y actualizar la URL, y probar la conexión.
 */
export const DYNAMIC_NETWORK_CONFIG = {
  /**
   * Devuelve la URL base actual.
   */
  getBaseURL: (): string => currentBaseURL,

  /**
   * Devuelve la URL para el endpoint de "health check" del servidor.
   */
  getHealthURL: (): string => `${currentBaseURL}/health`,

  /**
   * Actualiza la URL base y la guarda en el almacenamiento local.
   */
  setBaseURL: (newURL: string): void => {
    currentBaseURL = newURL;
    // Guardar la nueva URL para futuras sesiones
    saveNetworkConfig(newURL);
  },

  /**
   * Carga la URL desde el almacenamiento al iniciar la aplicación.
   */
  initialize: async (): Promise<void> => {
    const savedURL = await loadNetworkConfig();
    const envBase = (process.env.EXPO_PUBLIC_SERVER_BASE_URL || '').trim();
    if (savedURL) {
      currentBaseURL = savedURL;
    } else if (envBase) {
      currentBaseURL = envBase;
    }
  },
};

// Inicializar la configuración de red al cargar el módulo
DYNAMIC_NETWORK_CONFIG.initialize();
