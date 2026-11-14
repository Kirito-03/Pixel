-- Minimal migration: franchise_key for grouping franchises (Naruto/Shippuden/Boruto)

ALTER TABLE anime_content
    ADD COLUMN IF NOT EXISTS franchise_key VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_anime_content_franchise ON anime_content(franchise_key);

