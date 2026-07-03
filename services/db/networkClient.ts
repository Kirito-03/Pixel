/**
 * Módulo de red compartido para databaseService.
 * Encapsula la configuración de Axios, auto-reconexión y gestión de BASE_URL.
 */
import axios from 'axios';
import { Platform } from 'react-native';
import { loadNetworkConfig, saveNetworkConfig, clearNetworkConfig } from '../../utils/networkStorage';
import { getCandidateBaseURLs } from '../../utils/networkUtils';

const getInitialBaseURL = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3001';
    }
    return 'http://localhost:3001';
  }
  return 'http://localhost:3001';
};

let BASE_URL = getInitialBaseURL();

export const getCurrentBaseURL = () => BASE_URL;

// Instancia principal para JSON
export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Instancia para uploads (sin Content-Type predefinido)
export const axiosFileUpload = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Accept': 'application/json',
  },
});

// Cargar configuración guardada
loadNetworkConfig().then((savedURL) => {
  if (savedURL) {
    BASE_URL = savedURL;
    axiosInstance.defaults.baseURL = savedURL;
    axiosFileUpload.defaults.baseURL = savedURL;
    axios.defaults.baseURL = savedURL;
    console.log('URL cargada desde almacenamiento:', savedURL);
  } else {
    axios.defaults.baseURL = BASE_URL;
  }
}).catch(() => {
  console.log('Usando URL por defecto:', BASE_URL);
  axios.defaults.baseURL = BASE_URL;
});

// Contador de errores para evitar spam en logs
let errorCount = 0;
let lastErrorTime = 0;

// Interceptor para reintentos automáticos con auto-discovery de servidor
axiosInstance.interceptors.response.use(
  (response) => {
    errorCount = 0;
    return response;
  },
  async (error) => {
    if (error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      if (error.config?._retry) {
        return Promise.reject(error);
      }

      const now = Date.now();
      if (now - lastErrorTime > 10000 || errorCount === 0) {
        console.log('Error de red detectado, intentando encontrar servidor...');
        lastErrorTime = now;
        errorCount++;
      }

      const candidateBaseURLs = getCandidateBaseURLs();
      const currentBaseURL = axiosInstance.defaults.baseURL || BASE_URL;

      let workingBaseURL: string | null = null;

      if (currentBaseURL && candidateBaseURLs.includes(currentBaseURL)) {
        console.log(`   Ya estamos usando ${currentBaseURL}, probando otras URLs por si acaso...`);
      }

      for (const candidate of candidateBaseURLs) {
        if (candidate === currentBaseURL) continue;
        try {
          const testUrl = `${candidate}/health`;
          console.log(`   Probando ${candidate}...`);
          const testResponse = await axios.get(testUrl, { timeout: 5000 });
          if (testResponse.status === 200) {
            console.log(`   ${candidate} funciona! Actualizando baseURL...`);
            BASE_URL = candidate;
            axiosInstance.defaults.baseURL = candidate;
            axiosFileUpload.defaults.baseURL = candidate;
            axios.defaults.baseURL = candidate;
            saveNetworkConfig(candidate).catch(err => {
              console.warn('No se pudo guardar la configuración:', err);
            });
            console.log(`   Nuevo baseURL: ${BASE_URL}`);
            workingBaseURL = candidate;
            break;
          }
        } catch (testError) {
          console.log(`   ${candidate} falló`);
        }
      }

      if (workingBaseURL && error.config) {
        console.log('Reintentando solicitud con nueva IP...');
        error.config._retry = true;
        error.config.baseURL = workingBaseURL;
        return axiosInstance.request(error.config);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Reinicia la configuración de red: borra la URL guardada y vuelve a la predeterminada.
 */
export async function resetNetworkConfig() {
  await clearNetworkConfig();
  const initial = getInitialBaseURL();
  BASE_URL = initial;
  axiosInstance.defaults.baseURL = initial;
  axiosFileUpload.defaults.baseURL = initial;
  axios.defaults.baseURL = initial;
  console.log('Configuración de red reiniciada. BASE_URL:', initial);
}
