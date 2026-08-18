-- ========================================
-- Admin Panel Database Schema
-- ========================================
-- Tablas para el sistema de gestión de contenido de anime
-- Ejecutar después de bd_pixel_postgres.sql

-- ========================================
-- Tabla: admin_users
-- ========================================
-- Almacena información de administradores autenticados con Google OAuth
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture VARCHAR(500),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_google_id ON admin_users(google_id);

-- ========================================
-- Tabla: anime_content
-- ========================================
-- Almacena metadata de series/películas de anime
CREATE TABLE IF NOT EXISTS anime_content (
    id SERIAL PRIMARY KEY,
    tmdb_id INTEGER,
    title VARCHAR(255) NOT NULL,
    franchise_key VARCHAR(80),
    title_english VARCHAR(255),
    title_japanese VARCHAR(255),
    description TEXT,
    poster_url VARCHAR(500),
    banner_url VARCHAR(500),
    genres TEXT[], -- Array de géneros
    status VARCHAR(50) DEFAULT 'Unknown', -- Airing, Finished, Upcoming, Unknown
    total_episodes INTEGER DEFAULT 0,
    rating DECIMAL(3,1) DEFAULT 0.0,
    release_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_anime_content_tmdb ON anime_content(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_anime_content_franchise ON anime_content(franchise_key);
CREATE INDEX IF NOT EXISTS idx_anime_content_active ON anime_content(is_active);
CREATE INDEX IF NOT EXISTS idx_anime_content_title ON anime_content(title);
CREATE INDEX IF NOT EXISTS idx_anime_content_created ON anime_content(created_at DESC);

-- ========================================
-- Tabla: anime_episodes
-- ========================================
-- Almacena episodios y enlaces de video
CREATE TABLE IF NOT EXISTS anime_episodes (
    id SERIAL PRIMARY KEY,
    anime_id INTEGER NOT NULL REFERENCES anime_content(id) ON DELETE CASCADE,
    season INTEGER DEFAULT 1,
    episode_number INTEGER NOT NULL,
    title VARCHAR(255),
    video_url VARCHAR(1000), -- Google Drive direct link o local path (puede faltar en fase inicial)
    stream_url VARCHAR(1000), -- HLS stream URL (R2/CDN) generada tras transcode
    status VARCHAR(20) NOT NULL DEFAULT 'missing', -- missing | queued | processing | ready | error
    storage_type VARCHAR(20) DEFAULT 'gdrive', -- 'gdrive' | 'local' | 'r2' | 'external'
    duration INTEGER, -- Duración en minutos
    thumbnail_url VARCHAR(500),
    file_size BIGINT, -- Tamaño en bytes
    quality VARCHAR(10) DEFAULT '1080p', -- '720p', '1080p', '4K'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anime_id, season, episode_number)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_anime_episodes_anime ON anime_episodes(anime_id);
CREATE INDEX IF NOT EXISTS idx_anime_episodes_season_ep ON anime_episodes(anime_id, season, episode_number);
CREATE INDEX IF NOT EXISTS idx_anime_episodes_active ON anime_episodes(is_active);

-- ========================================
-- Trigger para actualizar updated_at automáticamente
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_anime_content_updated_at'
  ) THEN
    CREATE TRIGGER update_anime_content_updated_at BEFORE UPDATE ON anime_content
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_anime_episodes_updated_at'
  ) THEN
    CREATE TRIGGER update_anime_episodes_updated_at BEFORE UPDATE ON anime_episodes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ========================================
-- Datos de prueba (opcional - comentar en producción)
-- ========================================
-- INSERT INTO anime_content (title, title_english, description, status, total_episodes)
-- VALUES 
--     ('ナルト', 'Naruto', 'A young ninja who seeks recognition from his peers.', 'Finished', 220),
--     ('ワンピース', 'One Piece', 'Follows the adventures of Monkey D. Luffy.', 'Airing', 1000);

COMMENT ON TABLE admin_users IS 'Administradores autenticados con Google OAuth';
COMMENT ON TABLE anime_content IS 'Catálogo de anime gestionado manualmente';
COMMENT ON TABLE anime_episodes IS 'Episodios con enlaces a Google Drive o storage local';
