/**
 * Utilidad para guardar y cargar la configuración de red
 * Permite persistir la IP del servidor entre sesiones
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const NETWORK_CONFIG_KEY = '@pixelnosekai_network_config';

export interface NetworkConfig {
  baseURL: string;
  lastUpdated: number;
}

/**
 * Guarda la configuración de red
 */
export const saveNetworkConfig = async (baseURL: string): Promise<void> => {
  try {
    const config: NetworkConfig = {
      baseURL,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(NETWORK_CONFIG_KEY, JSON.stringify(config));
    console.log('Configuración de red guardada:', baseURL);
  } catch (error) {
    console.error('Error al guardar configuración de red:', error);
  }
};

/**
 * Carga la configuración de red guardada
 */
export const loadNetworkConfig = async (): Promise<string | null> => {
  try {
    const configData = await AsyncStorage.getItem(NETWORK_CONFIG_KEY);
    if (configData) {
      const config: NetworkConfig = JSON.parse(configData);
      // No reutilizar el dominio expirado o IPs locales al actualizar la aplicacion.
      if (!config.baseURL || /^https?:\/\/pixelnosekai\.art(?::\d+)?\/?$/i.test(config.baseURL) || /^https?:\/\/(?:192\.168\.|10\.0\.2\.2|127\.0\.0\.1|localhost)/i.test(config.baseURL)) {
        const migratedURL = 'https://pixelnosekai.com';
        await saveNetworkConfig(migratedURL);
        return migratedURL;
      }
      // Verificar que la configuración no sea muy antigua (más de 7 días)
      const daysSinceUpdate = (Date.now() - config.lastUpdated) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        console.log('Configuración de red cargada:', config.baseURL);
        return config.baseURL;
      } else {
        console.log('Configuración de red muy antigua, ignorando');
        await AsyncStorage.removeItem(NETWORK_CONFIG_KEY);
      }
    }
    return null;
  } catch (error) {
    console.error('Error al cargar configuración de red:', error);
    return null;
  }
};

/**
 * Elimina la configuración guardada
 */
export const clearNetworkConfig = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(NETWORK_CONFIG_KEY);
    console.log('Configuración de red eliminada');
  } catch (error) {
    console.error('Error al eliminar configuración de red:', error);
  }
};

