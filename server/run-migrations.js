import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5432';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const name = process.env.DB_NAME || 'bd_pixel';

const databaseUrl = process.env.DATABASE_URL || `postgres://${user}:${password}@${host}:${port}/${name}`;

// Usar ruta local del binario para que funcione en Docker sin modificar PATH
const pgMigrateBin = join(__dirname, 'node_modules', '.bin', 'node-pg-migrate');
const direction = process.argv[2] === 'down' ? 'down' : 'up';
const command = `node "${pgMigrateBin}" ${direction}`;

try {
  console.log(`Running: ${command}`);
  execSync(command, {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    }
  });
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
