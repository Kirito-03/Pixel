exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE anime_episodes 
    ADD COLUMN IF NOT EXISTS external_servers JSONB DEFAULT '[]'::jsonb;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE anime_episodes 
    DROP COLUMN IF EXISTS external_servers;
  `);
};
