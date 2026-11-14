-- ============================================================
-- Migración: agregar soporte R2/HLS a anime_episodes
-- Ejecutar UNA SOLA VEZ en producción y desarrollo
-- ============================================================

-- 1. Columna stream_url: URL pública del m3u8 en Cloudflare R2/CDN
ALTER TABLE anime_episodes
  ADD COLUMN IF NOT EXISTS stream_url VARCHAR(1000) DEFAULT NULL;

-- 2. Ampliar storage_type para aceptar el nuevo valor 'r2'
--    La columna es VARCHAR(20), no es ENUM, así que no requiere ALTER TYPE.
--    Si quieres una restricción explícita, puedes agregar un CHECK:
ALTER TABLE anime_episodes
  DROP CONSTRAINT IF EXISTS chk_storage_type;

ALTER TABLE anime_episodes
  ADD CONSTRAINT chk_storage_type
    CHECK (storage_type IN ('gdrive', 'local', 'r2', 'external'));

-- 3. Índice para búsquedas por stream_url (opcional pero útil)
CREATE INDEX IF NOT EXISTS idx_anime_episodes_stream_url
  ON anime_episodes(stream_url)
  WHERE stream_url IS NOT NULL;

-- Verificar resultado
SELECT
  column_name,
  data_type,
  character_maximum_length,
  column_default
FROM information_schema.columns
WHERE table_name = 'anime_episodes'
  AND column_name IN ('stream_url', 'storage_type', 'video_url')
ORDER BY column_name;
