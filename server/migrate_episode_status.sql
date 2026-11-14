-- Minimal migration: Episode status + allow missing video_url

ALTER TABLE anime_episodes
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'missing';

ALTER TABLE anime_episodes
    ALTER COLUMN video_url DROP NOT NULL;

UPDATE anime_episodes
SET status = CASE
    WHEN COALESCE(status, '') = '' THEN (CASE WHEN video_url IS NULL OR video_url = '' THEN 'missing' ELSE 'queued' END)
    WHEN status NOT IN ('missing','queued','processing','ready','error') THEN (CASE WHEN video_url IS NULL OR video_url = '' THEN 'missing' ELSE 'queued' END)
    ELSE status
END;

-- Optional: enforce allowed values (safe to re-run; wrapped to avoid duplicate errors)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'anime_episodes_status_check'
    ) THEN
        ALTER TABLE anime_episodes
            ADD CONSTRAINT anime_episodes_status_check
            CHECK (status IN ('missing','queued','processing','ready','error'));
    END IF;
END $$;

