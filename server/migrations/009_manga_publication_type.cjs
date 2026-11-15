exports.up = pgm => pgm.sql('ALTER TABLE manga_cache ADD COLUMN IF NOT EXISTS publication_type TEXT;');
exports.down = pgm => pgm.sql('ALTER TABLE manga_cache DROP COLUMN IF EXISTS publication_type;');
