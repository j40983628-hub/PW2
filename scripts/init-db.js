'use strict';

/*
 * Crea la base de datos, las tablas y los datos semilla ejecutando db/schema.sql.
 * Uso: npm run db:init   (usa DB_ADMIN_USER/DB_ADMIN_PASSWORD o, en su defecto, DB_USER/DB_PASSWORD)
 */
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mariadb = require('mariadb');

const main = async () => {
  const sql = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const conexion = await mariadb.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'root',
    password: process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });
  try {
    await conexion.query(sql);
    console.log('Esquema creado correctamente.');
  } finally {
    await conexion.end();
  }
};

main().catch((error) => {
  console.error('Error inicializando la base de datos:', error.message);
  process.exit(1);
});

