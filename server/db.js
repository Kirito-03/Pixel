import pg from 'pg';
const { Pool } = pg;

if (!process.env.DB_PASSWORD) {
  console.warn('⚠️  DB_PASSWORD no está configurada. Las conexiones a PostgreSQL fallarán.');
  console.warn('   Agrega DB_PASSWORD al archivo .env o usa docker-compose.');
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME || 'bd_netflix',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en pool de conexiones:', err.message);
});

export default pool;
