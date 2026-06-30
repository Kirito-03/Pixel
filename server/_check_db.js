import pg from 'pg';
const pool = new pg.Pool({
  host: 'localhost', port: 5432, user: 'root',
  password: 'netflix_dev_pass', database: 'bd_netflix'
});

const r = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name='anime_episodes' ORDER BY ordinal_position"
);
console.log('anime_episodes columns:', r.rows.map(x => x.column_name));

const t = await pool.query(
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
);
console.log('\nAll tables:', t.rows.map(x => x.tablename));

await pool.end();
