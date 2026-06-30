/**
 * Cache service con Redis (ioredis).
 * Graceful fallback: si ioredis no está instalado o Redis no está disponible,
 * el cache queda desactivado y la app funciona sin cache.
 */

let redis = null;
let isConnected = false;

// Import dinámico para no crashear si ioredis no está instalado
try {
  const { default: Redis } = await import('ioredis');
  redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('connect', () => {
    isConnected = true;
    console.log('[Cache] Redis conectado');
  });

  redis.on('error', (err) => {
    isConnected = false;
    if (!err._logged) {
      console.warn('[Cache] Redis no disponible:', err.message);
      err._logged = true;
    }
  });

  redis.on('close', () => {
    isConnected = false;
  });

  redis.connect().catch(() => {
    console.warn('[Cache] No se pudo conectar a Redis al inicio. Cache desactivado.');
  });
} catch (e) {
  console.warn('[Cache] ioredis no instalado — cache desactivado. Instala con: npm i ioredis');
}

const cache = {
  async get(key) {
    if (!isConnected || !redis) return null;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('[Cache] Error en get:', e.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 3600) {
    if (!isConnected || !redis) return false;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch (e) {
      console.warn('[Cache] Error en set:', e.message);
      return false;
    }
  },

  async del(key) {
    if (!isConnected || !redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (e) {
      console.warn('[Cache] Error en del:', e.message);
      return false;
    }
  },

  async getOrSet(key, ttlSeconds, fetchFn) {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const data = await fetchFn();
    this.set(key, data, ttlSeconds).catch(() => {});
    return data;
  },

  async delPattern(pattern) {
    if (!isConnected || !redis) return 0;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
      return keys.length;
    } catch (e) {
      console.warn('[Cache] Error en delPattern:', e.message);
      return 0;
    }
  },

  get connected() {
    return isConnected;
  },
};

export default cache;
