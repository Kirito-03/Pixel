exports.up = pgm => pgm.sql(`
  CREATE TABLE IF NOT EXISTS legacy_anime_metadata (
    anilist_id INTEGER PRIMARY KEY CHECK (anilist_id > 0),
    payload JSONB,
    expires_at TIMESTAMPTZ NOT NULL
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE IF EXISTS legacy_anime_metadata;');
