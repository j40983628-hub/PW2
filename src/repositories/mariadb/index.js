'use strict';

const mariadb = require('mariadb');
const { crearSalaRepository } = require('./salaRepository');
const { crearReservaRepository } = require('./reservaRepository');

const crearPool = (config) =>
  mariadb.createPool({
    ...config,
    dateStrings: true, // DATETIME como texto: evita conversiones de zona horaria
    insertIdAsNumber: true,
    bigIntAsNumber: true,
    decimalAsNumber: true,
  });

const crearRepositorios = (db) => Object.freeze({ salas: crearSalaRepository(db), reservas: crearReservaRepository(db) });

/**
 * "Store" = repositorios + unidad de trabajo transaccional.
 * `transaccion(fn)` entrega a `fn` repositorios ligados a una única conexión.
 */
const crearMariaDbStore = (pool) => {
  const transaccion = async (fn) => {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      const resultado = await fn(crearRepositorios(conexion));
      await conexion.commit();
      return resultado;
    } catch (error) {
      await conexion.rollback().catch(() => {});
      throw error;
    } finally {
      conexion.release();
    }
  };

  return Object.freeze({
    ...crearRepositorios(pool),
    transaccion,
    ping: async () => {
      await pool.query('SELECT 1');
    },
    cerrar: () => pool.end(),
  });
};

module.exports = { crearPool, crearMariaDbStore };

