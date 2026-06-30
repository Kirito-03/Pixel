// Tablas runtime de Pixel No Sekai.
// Usa CREATE TABLE IF NOT EXISTS para ser seguro en producción (ya existen).

exports.up = (pgm) => {
  // ── pns_my_list_items ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS pns_my_list_items (
      id SERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL,
      content_id INTEGER NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'tv', 'anime')),
      added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uniq_pns_my_list_item UNIQUE (profile_id, content_id, content_type)
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_my_list_profile_id ON pns_my_list_items(profile_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_my_list_content ON pns_my_list_items(content_type, content_id);`);

  // ── pns_watch_progress ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS pns_watch_progress (
      id SERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL,
      anime_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      current_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uniq_pns_watch_progress UNIQUE (profile_id, anime_id)
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_progress_profile_id ON pns_watch_progress(profile_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_progress_anime_id ON pns_watch_progress(anime_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_progress_episode_id ON pns_watch_progress(episode_id);`);

  // ── news_articles ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT, content TEXT,
      source_name TEXT, source_url TEXT, image_url TEXT,
      published_at TIMESTAMP, category TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      language TEXT NOT NULL DEFAULT 'es',
      is_featured BOOLEAN NOT NULL DEFAULT false,
      external_url TEXT,
      has_valid_image BOOLEAN NOT NULL DEFAULT false,
      is_publishable BOOLEAN NOT NULL DEFAULT false,
      quality_score INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_news_articles_external_url ON news_articles(external_url) WHERE external_url IS NOT NULL;`);

  // ── manga_cache ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS manga_cache (
      manga_id TEXT PRIMARY KEY,
      title TEXT NOT NULL, description TEXT, cover_url TEXT, status TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb, content_rating TEXT,
      year INTEGER, chapter_count INTEGER NOT NULL DEFAULT 0,
      latest_chapter TEXT, author TEXT, artist TEXT,
      md_updated_at TIMESTAMP,
      cached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      popularity_score INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true
    );
  `);

  // ── manga_chapters_cache ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS manga_chapters_cache (
      chapter_id TEXT PRIMARY KEY,
      manga_id TEXT NOT NULL, chapter TEXT, title TEXT, volume TEXT,
      translated_language TEXT, publish_at TIMESTAMP, readable_at TIMESTAMP,
      pages INTEGER, external_url TEXT,
      cached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_manga_chapters_manga_id ON manga_chapters_cache(manga_id);`);

  // ── pns_job_runs ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS pns_job_runs (
      job_key TEXT PRIMARY KEY,
      last_run_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── anime_title_aliases ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS anime_title_aliases (
      id BIGSERIAL PRIMARY KEY,
      anime_id INTEGER NOT NULL REFERENCES anime_content(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_anime_title_aliases_anime_id ON anime_title_aliases(anime_id);`);

  // ── transcode_jobs ──
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS transcode_jobs (
      id BIGSERIAL PRIMARY KEY,
      episode_id INTEGER NOT NULL,
      src TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error', 'canceled')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP, finished_at TIMESTAMP
    );
  `);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_transcode_jobs_episode_id ON transcode_jobs(episode_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_transcode_jobs_status ON transcode_jobs(status, updated_at DESC);`);

  // ── Columna stream_url en anime_episodes ──
  pgm.sql(`ALTER TABLE anime_episodes ADD COLUMN IF NOT EXISTS stream_url VARCHAR(1000);`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS transcode_jobs CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS anime_title_aliases CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS pns_job_runs CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS manga_chapters_cache CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS manga_cache CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS news_articles CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS pns_watch_progress CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS pns_my_list_items CASCADE;`);
};
