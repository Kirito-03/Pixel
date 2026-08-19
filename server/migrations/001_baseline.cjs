// Baseline migration — marca el punto de partida del sistema de migraciones.
// El schema core (anime_content, etc.) se crea en la migración 002.

exports.up = (pgm) => {
  console.log('Migration 001: Baseline — no hay cambios que aplicar.');
};

exports.down = (pgm) => {
  throw new Error('Cannot revert baseline migration.');
};
