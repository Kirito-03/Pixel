/**
 * Migration 003 — Unify Legacy Lists
 *
 * Transfers all records from the legacy tables `listas` + `lista_items`
 * into the unified `pns_my_list_items` table, mapping perfil_id → profile_id.
 * Then drops the legacy tables and the orphaned `list_type_enum` type.
 *
 * This migration is safe to run even if:
 * - The legacy tables have no data (cleanup-only).
 * - `pns_my_list_items` already contains rows (uses ON CONFLICT DO NOTHING).
 * - The legacy tables have already been dropped (uses IF EXISTS).
 */

exports.up = (pgm) => {
  // ── Step 1: Ensure target table exists (idempotent) ──────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS pns_my_list_items (
      id SERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL,
      content_id INTEGER NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'tv', 'anime')),
      added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uniq_pns_my_list_item UNIQUE (profile_id, content_id, content_type)
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_my_list_profile_id ON pns_my_list_items(profile_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pns_my_list_content ON pns_my_list_items(content_type, content_id);`);

  // ── Step 2: Migrate data from legacy tables ──────────────────
  // Only runs if both legacy tables still exist.
  // Maps: listas.perfil_id → pns_my_list_items.profile_id
  //        lista_items.content_id → pns_my_list_items.content_id
  //        lista_items.content_type → pns_my_list_items.content_type (cast from enum to text)
  //        lista_items.added_at → pns_my_list_items.added_at
  // ON CONFLICT DO NOTHING prevents duplicates if some items were already in pns_my_list_items.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listas')
         AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lista_items')
      THEN
        INSERT INTO pns_my_list_items (profile_id, content_id, content_type, added_at)
        SELECT
          l.perfil_id,
          li.content_id,
          li.content_type::text,
          li.added_at
        FROM lista_items li
        JOIN listas l ON l.id = li.lista_id
        ON CONFLICT (profile_id, content_id, content_type) DO NOTHING;

        RAISE NOTICE 'Migration 003: Legacy data migrated to pns_my_list_items.';
      ELSE
        RAISE NOTICE 'Migration 003: Legacy tables not found, skipping data migration.';
      END IF;
    END $$;
  `);

  // ── Step 3: Drop legacy tables ───────────────────────────────
  // Drop lista_items first (has FK to listas)
  pgm.sql(`DROP TABLE IF EXISTS lista_items CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS listas CASCADE;`);

  // ── Step 4: Clean up orphaned enum type ──────────────────────
  pgm.sql(`DROP TYPE IF EXISTS list_type_enum;`);
};

exports.down = (pgm) => {
  // Recreate legacy tables (empty) for reversibility.
  // Data cannot be fully restored — a DB backup is required for that.

  // Recreate the enum if it was dropped
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_type_enum') THEN
        CREATE TYPE list_type_enum AS ENUM ('MY_LIST');
      END IF;
    END $$;
  `);

  // Recreate listas table
  pgm.sql(`
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
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_listas_perfil_id ON listas(perfil_id);`);

  // Recreate lista_items table
  pgm.sql(`
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
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_lista_items_lista_id ON lista_items(lista_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_lista_items_content_id ON lista_items(content_id);`);
};
