import axios from 'axios';
import { setupCache } from 'axios-cache-interceptor';
import { getCurrentBaseURL } from './databaseService';

function getBaseURL() {
  return getCurrentBaseURL() || 'http://localhost:3001';
}

const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

axiosInstance.interceptors.request.use((config) => {
  config.baseURL = getBaseURL();
  return config;
});

export const backendClient = setupCache(axiosInstance, {
  ttl: 1000 * 60 * 5, // 5 minutos de caché para el VPS (manga, noticias, etc)
});
