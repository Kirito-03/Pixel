// Baseline migration — aplica el schema core en instalaciones frescas.
// Usa los archivos SQL con IF NOT EXISTS / IF NOT EXISTS para ser idempotente
// en producción (las tablas ya existen → no hace nada).
const fs = require('fs');
const path = require('path');

exports.up = (pgm) => {
  // Aplicar schema core (anime_content, anime_episodes, etc.)
  // IF NOT EXISTS en cada CREATE TABLE hace esto seguro en producción.
  const bdSqlPath = path.join(__dirname, '../bd_pixel_postgres.sql');
  if (fs.existsSync(bdSqlPath)) {
    const bdSql = fs.readFileSync(bdSqlPath, 'utf8');
    pgm.sql(bdSql);
    console.log('Baseline: bd_pixel_postgres.sql aplicado.');
  } else {
    console.warn('Baseline: bd_pixel_postgres.sql no encontrado, saltando.');
  }

  const adminSqlPath = path.join(__dirname, '../admin_schema.sql');
  if (fs.existsSync(adminSqlPath)) {
    const adminSql = fs.readFileSync(adminSqlPath, 'utf8');
    pgm.sql(adminSql);
    console.log('Baseline: admin_schema.sql aplicado.');
  } else {
    console.warn('Baseline: admin_schema.sql no encontrado, saltando.');
  }
};

exports.down = (pgm) => {
  // No se puede revertir el schema base
  throw new Error('Cannot revert baseline migration — would drop the entire schema.');
};
