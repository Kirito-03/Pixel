exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type_enum') THEN
        CREATE TYPE content_type_enum AS ENUM ('movie', 'tv', 'anime');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_type_enum') THEN
        CREATE TYPE list_type_enum AS ENUM ('MY_LIST');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_type_enum') THEN
        CREATE TYPE image_type_enum AS ENUM ('poster', 'backdrop', 'avatar', 'thumbnail');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type_enum') THEN
        CREATE TYPE entity_type_enum AS ENUM ('contenido', 'perfil', 'anime');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'download_status_enum') THEN
        CREATE TYPE download_status_enum AS ENUM ('PENDING', 'DOWNLOADING', 'COMPLETED', 'FAILED');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
        CREATE TYPE user_role_enum AS ENUM ('user', 'admin');
      END IF;
    END $$;

    -- ========================================
    -- Table: usuarios
    -- ========================================
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role user_role_enum NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_usuarios_email ON usuarios(email);

    -- ========================================
    -- Table: perfiles
    -- ========================================
    CREATE TABLE IF NOT EXISTS perfiles (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(500) NOT NULL,
      is_kids BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_perfiles_usuario_id 
        FOREIGN KEY (usuario_id) 
        REFERENCES usuarios(id) 
        ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_perfiles_usuario_id ON perfiles(usuario_id);

    -- ========================================
    -- Table: listas (ej.: MY_LIST)
    -- ========================================
    CREATE TABLE IF NOT EXISTS listas (
      id SERIAL PRIMARY KEY,
      perfil_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      type list_type_enum NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_listas_perfil_id 
        FOREIGN KEY (perfil_id) 
        REFERENCES perfiles(id) 
        ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_listas_perfil_id ON listas(perfil_id);

    -- ========================================
    -- Table: lista_items
    -- ========================================
    CREATE TABLE IF NOT EXISTS lista_items (
      id SERIAL PRIMARY KEY,
      lista_id INTEGER NOT NULL,
      content_id INTEGER NOT NULL,
      content_type content_type_enum NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_lista_items_lista_id 
        FOREIGN KEY (lista_id) 
        REFERENCES listas(id) 
        ON DELETE CASCADE,
      CONSTRAINT uniq_lista_item 
        UNIQUE (lista_id, content_id, content_type)
    );
    CREATE INDEX IF NOT EXISTS idx_lista_items_lista_id ON lista_items(lista_id);
    CREATE INDEX IF NOT EXISTS idx_lista_items_content_id ON lista_items(content_id);

    -- ========================================
    -- Table: contenido
    -- ========================================
    CREATE TABLE IF NOT EXISTS contenido (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      type content_type_enum NOT NULL,
      overview TEXT,
      poster_url VARCHAR(500),
      backdrop_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_contenido_type ON contenido(type);

    -- ========================================
    -- Table: imagenes
    -- ========================================
    CREATE TABLE IF NOT EXISTS imagenes (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      url VARCHAR(500) NOT NULL,
      type image_type_enum NOT NULL,
      entity_id INTEGER,
      entity_type entity_type_enum,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_imagenes_entity ON imagenes(entity_type, entity_id);

    -- ========================================
    -- Table: password_resets
    -- ========================================
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_password_resets_usuario_id 
        FOREIGN KEY (usuario_id) 
        REFERENCES usuarios(id) 
        ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_password_resets_token ON password_resets(token);
    CREATE INDEX IF NOT EXISTS idx_password_resets_usuario_id ON password_resets(usuario_id);

    -- ========================================
    -- Table: descargas
    -- ========================================
    CREATE TABLE IF NOT EXISTS descargas (
      id SERIAL PRIMARY KEY,
      perfil_id INTEGER NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL DEFAULT 'Descargas',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_descargas_perfil_id 
        FOREIGN KEY (perfil_id) 
        REFERENCES perfiles(id) 
        ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_descargas_perfil ON descargas(perfil_id);
    CREATE INDEX IF NOT EXISTS idx_descargas_perfil_id ON descargas(perfil_id);

    -- ========================================
    -- Table: descarga_items
    -- ========================================
    CREATE TABLE IF NOT EXISTS descarga_items (
      id SERIAL PRIMARY KEY,
      descarga_id INTEGER NOT NULL,
      content_id INTEGER NOT NULL,
      content_type content_type_enum NOT NULL,
      status download_status_enum NOT NULL DEFAULT 'PENDING',
      progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
      file_path VARCHAR(255),
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_descarga_items_descarga_id 
        FOREIGN KEY (descarga_id) 
        REFERENCES descargas(id) 
        ON DELETE CASCADE,
      CONSTRAINT uniq_descarga_item 
        UNIQUE (descarga_id, content_id, content_type)
    );
    CREATE INDEX IF NOT EXISTS idx_descarga_items_descarga_id ON descarga_items(descarga_id);

    -- ========================================
    -- Trigger for updated_at auto-update
    -- ========================================
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $f$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_descarga_items_updated_at'
      ) THEN
        CREATE TRIGGER update_descarga_items_updated_at
          BEFORE UPDATE ON descarga_items
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  // En producción real no haríamos drops, pero por completitud
  pgm.sql(`DROP TABLE IF EXISTS descarga_items CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS descargas CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS password_resets CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS imagenes CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS contenido CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS lista_items CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS listas CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS perfiles CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS usuarios CASCADE;`);
  pgm.sql(`DROP TYPE IF EXISTS user_role_enum CASCADE;`);
  pgm.sql(`DROP TYPE IF EXISTS download_status_enum CASCADE;`);
  pgm.sql(`DROP TYPE IF EXISTS entity_type_enum CASCADE;`);
  pgm.sql(`DROP TYPE IF EXISTS image_type_enum CASCADE;`);
  pgm.sql(`DROP TYPE IF EXISTS list_type_enum CASCADE;`);
};
