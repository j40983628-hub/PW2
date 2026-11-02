'use strict';

const { aIso, aSql } = require('../../domain/validacion');
const { ejecutar } = require('./consulta');

const SELECT_BASE = `
  SELECT r.id, r.sala_id, s.nombre AS sala_nombre, r.responsable, r.motivo,
         r.inicio, r.fin, r.asistentes, r.estado, r.version, r.creado_en, r.actualizado_en
    FROM reservas r
    JOIN salas s ON s.id = r.sala_id`;

/** Fila de la BD -> objeto de dominio. Pura. */
const filaAReserva = (f) =>
  f
    ? Object.freeze({
        id: f.id,
        salaId: f.sala_id,
        salaNombre: f.sala_nombre,
        responsable: f.responsable,
        motivo: f.motivo,
        inicio: aIso(f.inicio),
        fin: aIso(f.fin),
        asistentes: f.asistentes,
        estado: f.estado,
        version: f.version,
        creadoEn: aIso(f.creado_en),
        actualizadoEn: aIso(f.actualizado_en),
      })
    : null;

/** Construye un WHERE parametrizado a partir de filtros ya validados. Pura. */
const construirWhere = ({ salaId, estado, desde, hasta } = {}) => {
  const condiciones = [
    salaId !== undefined && ['r.sala_id = ?', salaId],
    estado !== undefined && ['r.estado = ?', estado],
    desde !== undefined && ['r.fin > ?', aSql(desde)],
    hasta !== undefined && ['r.inicio < ?', aSql(hasta)],
  ].filter(Boolean);
  return {
    sql: condiciones.length > 0 ? `WHERE ${condiciones.map(([c]) => c).join(' AND ')}` : '',
    parametros: condiciones.map(([, p]) => p),
  };
};

const valoresReserva = (d) => [d.salaId, d.responsable, d.motivo, aSql(d.inicio), aSql(d.fin), d.asistentes, d.estado];

const crearReservaRepository = (db) => {
  const buscarPorId = async (id, { bloquear = false } = {}) => {
    const filas = await ejecutar(db, `${SELECT_BASE} WHERE r.id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id]);
    return filaAReserva(filas[0]);
  };

  const listar = async (filtros, { limite, offset }) => {
    const where = construirWhere(filtros);
    const [filas, [{ total }]] = await Promise.all([
      ejecutar(db, `${SELECT_BASE} ${where.sql} ORDER BY r.inicio, r.id LIMIT ? OFFSET ?`, [
        ...where.parametros,
        limite,
        offset,
      ]),
      ejecutar(db, `SELECT COUNT(*) AS total FROM reservas r ${where.sql}`, where.parametros),
    ]);
    return { items: filas.map(filaAReserva), total: Number(total) };
  };

  const listarTodas = async (filtros) => {
    const where = construirWhere(filtros);
    const filas = await ejecutar(db, `${SELECT_BASE} ${where.sql} ORDER BY r.inicio, r.id`, where.parametros);
    return filas.map(filaAReserva);
  };

  /** Reservas confirmadas que se cruzan con [inicio, fin). Lectura con bloqueo. */
  const buscarSolapadas = async ({ salaId, inicio, fin, excluirId = 0 }) => {
    const filas = await ejecutar(
      db,
      `${SELECT_BASE}
        WHERE r.sala_id = ? AND r.estado = 'confirmada' AND r.inicio < ? AND r.fin > ? AND r.id <> ?
        FOR UPDATE`,
      [salaId, aSql(fin), aSql(inicio), excluirId],
    );
    return filas.map(filaAReserva);
  };

  const insertar = async (datos) => {
    const r = await ejecutar(
      db,
      `INSERT INTO reservas (sala_id, responsable, motivo, inicio, fin, asistentes, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      valoresReserva(datos),
    );
    return buscarPorId(r.insertId);
  };

  /** Bloqueo optimista: solo actualiza si la versión coincide. Devuelve null si no. */
  const actualizar = async (id, datos, versionEsperada) => {
    const r = await ejecutar(
      db,
      `UPDATE reservas
          SET sala_id = ?, responsable = ?, motivo = ?, inicio = ?, fin = ?, asistentes = ?, estado = ?,
              version = version + 1
        WHERE id = ? AND version = ?`,
      [...valoresReserva(datos), id, versionEsperada],
    );
    return r.affectedRows > 0 ? buscarPorId(id) : null;
  };

  const eliminar = async (id) => {
    const r = await ejecutar(db, 'DELETE FROM reservas WHERE id = ?', [id]);
    return r.affectedRows > 0;
  };

  return Object.freeze({ buscarPorId, listar, listarTodas, buscarSolapadas, insertar, actualizar, eliminar });
};

module.exports = { crearReservaRepository, filaAReserva, construirWhere };

