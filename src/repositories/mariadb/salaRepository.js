'use strict';

const { aIso } = require('../../domain/validacion');
const { ConflictError } = require('../../domain/errores');
const { ejecutar } = require('./consulta');

const COLUMNAS = 'id, nombre, capacidad, ubicacion, creado_en, actualizado_en';

/** Fila de la BD (snake_case) -> objeto de dominio (camelCase). Pura. */
const filaASala = (f) =>
  f
    ? Object.freeze({
        id: f.id,
        nombre: f.nombre,
        capacidad: f.capacidad,
        ubicacion: f.ubicacion,
        creadoEn: aIso(f.creado_en),
        actualizadoEn: aIso(f.actualizado_en),
      })
    : null;

const nombreDuplicado = (error) =>
  error instanceof ConflictError && error.code === 'DUPLICADO'
    ? new ConflictError('SALA_DUPLICADA', 'Ya existe una sala con ese nombre')
    : error;

const crearSalaRepository = (db) => {
  const buscarPorId = async (id, { bloquear = false } = {}) => {
    const filas = await ejecutar(db, `SELECT ${COLUMNAS} FROM salas WHERE id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id]);
    return filaASala(filas[0]);
  };

  const listar = async () => (await ejecutar(db, `SELECT ${COLUMNAS} FROM salas ORDER BY nombre`)).map(filaASala);

  const insertar = async ({ nombre, capacidad, ubicacion }) => {
    try {
      const r = await ejecutar(db, 'INSERT INTO salas (nombre, capacidad, ubicacion) VALUES (?, ?, ?)', [
        nombre,
        capacidad,
        ubicacion,
      ]);
      return buscarPorId(r.insertId);
    } catch (error) {
      throw nombreDuplicado(error);
    }
  };

  const actualizar = async (id, { nombre, capacidad, ubicacion }) => {
    try {
      const r = await ejecutar(db, 'UPDATE salas SET nombre = ?, capacidad = ?, ubicacion = ? WHERE id = ?', [
        nombre,
        capacidad,
        ubicacion,
        id,
      ]);
      return r.affectedRows > 0 ? buscarPorId(id) : null;
    } catch (error) {
      throw nombreDuplicado(error);
    }
  };

  const eliminar = async (id) => {
    const r = await ejecutar(db, 'DELETE FROM salas WHERE id = ?', [id]);
    return r.affectedRows > 0;
  };

  return Object.freeze({ listar, buscarPorId, insertar, actualizar, eliminar });
};

module.exports = { crearSalaRepository, filaASala };

