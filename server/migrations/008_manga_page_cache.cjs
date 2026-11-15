exports.up = pgm => pgm.sql(`
  CREATE TABLE IF NOT EXISTS manga_page_cache (
    chapter_url TEXT PRIMARY KEY,
    pages JSONB NOT NULL CHECK (jsonb_typeof(pages) = 'array'),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE IF EXISTS manga_page_cache;');
