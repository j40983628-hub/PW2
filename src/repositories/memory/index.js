'use strict';

/*
 * Implementación en memoria del mismo contrato que el store de MariaDB.
 * Se usa en las pruebas automatizadas. El estado es inmutable: cada escritura
 * produce un nuevo estado, lo que permite "rollback" restaurando una instantánea.
 */

const { ConflictError } = require('../../domain/errores');
const { seSolapan } = require('../../domain/reserva');

const ahora = () => new Date().toISOString().slice(0, 19);

const crearMemoryStore = () => {
  let estado = Object.freeze({ salas: [], reservas: [], secuencia: { salas: 0, reservas: 0 } });
  let cola = Promise.resolve();

  const conNombreSala = (r) =>
    r ? Object.freeze({ ...r, salaNombre: estado.salas.find((s) => s.id === r.salaId)?.nombre ?? null }) : null;

  const nombreEnUso = (nombre, excluirId) =>
    estado.salas.some((s) => s.id !== excluirId && s.nombre.toLowerCase() === nombre.toLowerCase());

  const salas = Object.freeze({
    listar: async () => [...estado.salas].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    buscarPorId: async (id) => estado.salas.find((s) => s.id === id) ?? null,
    insertar: async (datos) => {
      if (nombreEnUso(datos.nombre)) throw new ConflictError('SALA_DUPLICADA', 'Ya existe una sala con ese nombre');
      const id = estado.secuencia.salas + 1;
      const sala = Object.freeze({ id, ...datos, creadoEn: ahora(), actualizadoEn: ahora() });
      estado = { ...estado, salas: [...estado.salas, sala], secuencia: { ...estado.secuencia, salas: id } };
      return sala;
    },
    actualizar: async (id, datos) => {
      const actual = estado.salas.find((s) => s.id === id);
      if (!actual) return null;
      if (nombreEnUso(datos.nombre, id)) throw new ConflictError('SALA_DUPLICADA', 'Ya existe una sala con ese nombre');
      const nueva = Object.freeze({ ...actual, ...datos, actualizadoEn: ahora() });
      estado = { ...estado, salas: estado.salas.map((s) => (s.id === id ? nueva : s)) };
      return nueva;
    },
    eliminar: async (id) => {
      if (!estado.salas.some((s) => s.id === id)) return false;
      if (estado.reservas.some((r) => r.salaId === id)) {
        throw new ConflictError('RECURSO_REFERENCIADO', 'El recurso tiene registros asociados y no puede eliminarse');
      }
      estado = { ...estado, salas: estado.salas.filter((s) => s.id !== id) };
      return true;
    },
  });

  const cumpleFiltros = ({ salaId, estado: est, desde, hasta } = {}) => (r) =>
    (salaId === undefined || r.salaId === salaId) &&
    (est === undefined || r.estado === est) &&
    (desde === undefined || r.fin > desde) &&
    (hasta === undefined || r.inicio < hasta);

  const ordenar = (lista) => [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id);

  const reservas = Object.freeze({
    buscarPorId: async (id) => conNombreSala(estado.reservas.find((r) => r.id === id)),
    listar: async (filtros, { limite, offset }) => {
      const filtradas = ordenar(estado.reservas.filter(cumpleFiltros(filtros)));
      return { items: filtradas.slice(offset, offset + limite).map(conNombreSala), total: filtradas.length };
    },
    listarTodas: async (filtros) => ordenar(estado.reservas.filter(cumpleFiltros(filtros))).map(conNombreSala),
    buscarSolapadas: async ({ salaId, inicio, fin, excluirId = 0 }) =>
      estado.reservas
        .filter((r) => r.salaId === salaId && r.estado === 'confirmada' && r.id !== excluirId)
        .filter((r) => seSolapan(r, { inicio, fin }))
        .map(conNombreSala),
    insertar: async (datos) => {
      const id = estado.secuencia.reservas + 1;
      const reserva = Object.freeze({ id, ...datos, version: 1, creadoEn: ahora(), actualizadoEn: ahora() });
      estado = { ...estado, reservas: [...estado.reservas, reserva], secuencia: { ...estado.secuencia, reservas: id } };
      return conNombreSala(reserva);
    },
    actualizar: async (id, datos, versionEsperada) => {
      const actual = estado.reservas.find((r) => r.id === id && r.version === versionEsperada);
      if (!actual) return null;
      const nueva = Object.freeze({ ...actual, ...datos, version: actual.version + 1, actualizadoEn: ahora() });
      estado = { ...estado, reservas: estado.reservas.map((r) => (r.id === id ? nueva : r)) };
      return conNombreSala(nueva);
    },
    eliminar: async (id) => {
      const existe = estado.reservas.some((r) => r.id === id);
      estado = { ...estado, reservas: estado.reservas.filter((r) => r.id !== id) };
      return existe;
    },
  });

  const repositorios = Object.freeze({ salas, reservas });

  /** Serializa las transacciones (como el FOR UPDATE de MariaDB) y revierte si fallan. */
  const transaccion = (fn) => {
    const ejecucion = cola.then(async () => {
      const instantanea = estado;
      try {
        return await fn(repositorios);
      } catch (error) {
        estado = instantanea;
        throw error;
      }
    });
    cola = ejecucion.catch(() => {});
    return ejecucion;
  };

  return Object.freeze({ ...repositorios, transaccion, ping: async () => {}, cerrar: async () => {} });
};

module.exports = { crearMemoryStore };

