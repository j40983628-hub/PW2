'use strict';

const { ConflictError } = require('../../domain/errores');

/* Códigos de error de MariaDB/InnoDB que se traducen a conflictos HTTP 409. */
const ER_DUP_ENTRY = 1062;
const ER_ROW_IS_REFERENCED_2 = 1451;
const ER_NO_REFERENCED_ROW_2 = 1452;
const ER_LOCK_DEADLOCK = 1213;
const ER_LOCK_WAIT_TIMEOUT = 1205;

const traducirErrorDb = (error) => {
  switch (error.errno) {
    case ER_DUP_ENTRY:
      return new ConflictError('DUPLICADO', 'Ya existe un registro con ese valor único', {
        restriccion: error.sqlMessage,
      });
    case ER_ROW_IS_REFERENCED_2:
      return new ConflictError('RECURSO_REFERENCIADO', 'El recurso tiene registros asociados y no puede eliminarse');
    case ER_NO_REFERENCED_ROW_2:
      return new ConflictError('REFERENCIA_INVALIDA', 'El registro referenciado no existe');
    case ER_LOCK_DEADLOCK:
    case ER_LOCK_WAIT_TIMEOUT:
      return new ConflictError('CONFLICTO_CONCURRENCIA', 'Operación concurrente detectada, intente nuevamente');
    default:
      return error;
  }
};

/** Ejecuta SIEMPRE consultas parametrizadas (placeholders `?`) y traduce errores. */
const ejecutar = async (db, sql, parametros = []) => {
  try {
    return await db.query(sql, parametros);
  } catch (error) {
    throw traducirErrorDb(error);
  }
};

module.exports = { ejecutar, traducirErrorDb };

