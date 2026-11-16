exports.up = pgm => pgm.sql(`
CREATE TABLE IF NOT EXISTS anime_synopsis_es (
 source_hash TEXT PRIMARY KEY, source_text TEXT NOT NULL, segments JSONB NOT NULL,
 translated_text TEXT, status TEXT NOT NULL DEFAULT 'pending', priority INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), translated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS anime_synopsis_es_queue ON anime_synopsis_es(status,next_attempt_at,priority DESC);
CREATE TABLE IF NOT EXISTS synopsis_translation_usage (
 id BIGSERIAL PRIMARY KEY, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), characters INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS synopsis_translation_usage_time ON synopsis_translation_usage(requested_at);
`);
exports.down = pgm => pgm.sql('DROP TABLE IF EXISTS synopsis_translation_usage; DROP TABLE IF EXISTS anime_synopsis_es;');
