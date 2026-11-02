'use strict';

require('dotenv').config();

const numero = (valor, porDefecto) => (valor !== undefined && valor !== '' && Number.isFinite(Number(valor)) ? Number(valor) : porDefecto);

const config = Object.freeze({
  puerto: numero(process.env.PORT, 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: Object.freeze({
    host: process.env.DB_HOST || 'localhost',
    port: numero(process.env.DB_PORT, 3306),
    user: process.env.DB_USER !== undefined ? process.env.DB_USER : 'reservas',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'reservas',
    database: process.env.DB_NAME || 'reservas_db',
    connectionLimit: numero(process.env.DB_POOL, 10),
  }),
});

module.exports = config;

