// Configuración de node-pg-migrate
// Lee las variables de entorno DB_* que ya usa el proyecto.

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DATABASE_URL } = process.env;

let databaseUrl = DATABASE_URL;

if (!databaseUrl && DB_PASSWORD) {
  const host = DB_HOST || 'localhost';
  const port = DB_PORT || '5432';
  const user = DB_USER || 'root';
  const name = DB_NAME || 'bd_netflix';
  databaseUrl = `postgres://${user}:${DB_PASSWORD}@${host}:${port}/${name}`;
}

module.exports = {
  databaseUrl: databaseUrl || `postgres://root@localhost:5432/bd_netflix`,
  dir: 'migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
  schema: 'public',
};
