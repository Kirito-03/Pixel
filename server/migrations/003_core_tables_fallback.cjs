const fs = require('fs');
const path = require('path');

exports.up = (pgm) => {
  // Aseguramos que todas las tablas core existan en caso de que docker-entrypoint-initdb.d fallara
  try {
    const bdSqlPath = path.join(__dirname, '../bd_pixel_postgres.sql');
    if (fs.existsSync(bdSqlPath)) {
      const bdSql = fs.readFileSync(bdSqlPath, 'utf8');
      pgm.sql(bdSql);
    }

    const adminSqlPath = path.join(__dirname, '../admin_schema.sql');
    if (fs.existsSync(adminSqlPath)) {
      const adminSql = fs.readFileSync(adminSqlPath, 'utf8');
      pgm.sql(adminSql);
    }
  } catch (error) {
    console.error('Error ejecutando SQL scripts en migración 003:', error);
    throw error;
  }
};

exports.down = (pgm) => {
  // Opcional, pero al ser un fallback de tablas iniciales, no las dropeamos aquí.
};
