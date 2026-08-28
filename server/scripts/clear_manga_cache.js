import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'pixel_user',
  password: process.env.DB_PASSWORD || 'pixel_pass',
  database: process.env.DB_NAME || 'pixel_db',
  port: process.env.DB_PORT || 5432,
});

async function run() {
  try {
    console.log('Truncating manga_cache and manga_chapters_cache...');
    await pool.query('TRUNCATE TABLE manga_cache, manga_chapters_cache CASCADE;');
    console.log('Deleting manga sync jobs from system_jobs...');
    await pool.query("DELETE FROM system_jobs WHERE job_name LIKE 'manga:%';");
    console.log('Done!');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
