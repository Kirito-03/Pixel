exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE anime_content
    ADD COLUMN IF NOT EXISTS trailer_id VARCHAR(32),
    ADD COLUMN IF NOT EXISTS trailer_site VARCHAR(32),
    ADD COLUMN IF NOT EXISTS trailer_checked_at TIMESTAMPTZ;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE anime_content
    DROP COLUMN IF EXISTS trailer_checked_at,
    DROP COLUMN IF EXISTS trailer_site,
    DROP COLUMN IF EXISTS trailer_id;
  `);
};
