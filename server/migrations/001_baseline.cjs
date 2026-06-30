// Baseline migration — representa el schema existente en producción.
// NO ejecuta SQL porque la DB ya tiene todas las tablas iniciales.
// Este archivo existe para que node-pg-migrate sepa que el estado "cero"
// ya está aplicado en producción.

exports.up = (pgm) => {
  // Schema inicial ya existente en producción:
  // - usuarios
  // - perfiles  
  // - listas
  // - lista_items
  // - descargas
  // - descarga_items
  // - contenido
  // - imagenes
  // - password_resets
  // - anime_content
  // - anime_episodes
  // - anime_genres
  // - anime_content_genres
  //
  // Referencia completa: server/sql/bd_netflix_postgres.sql
  console.log('Baseline migration: schema inicial ya presente en producción.');
};

exports.down = (pgm) => {
  // No se puede revertir el schema base
  throw new Error('Cannot revert baseline migration — would drop the entire schema.');
};
