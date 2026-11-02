'use strict';

const dominio = require('../domain/reserva');
const { reservasACsv, csvAEntradas } = require('../domain/csv');
const {
  AppError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ValidationError,
  exigir,
} = require('../domain/errores');

const MAX_FILAS_IMPORTACION = 500;

const crearReservaService = ({ store, notificador }) => {
  /* ---------- Reglas que requieren E/S (siempre dentro de una transacción) ---------- */

  const asegurarDisponibilidad = async (tx, datos, excluirId) => {
    // Bloquea la fila de la sala: serializa reservas concurrentes sobre la misma sala.
    const sala = await tx.salas.buscarPorId(datos.salaId, { bloquear: true });
    if (!sala) throw new BusinessRuleError('SALA_INEXISTENTE', `La sala ${datos.salaId} no existe`);

    if (dominio.excedeCapacidad(sala, datos)) {
      throw new BusinessRuleError('CAPACIDAD_EXCEDIDA', 'El número de asistentes supera la capacidad de la sala', {
        capacidad: sala.capacidad,
        asistentes: datos.asistentes,
      });
    }
    if (!dominio.ocupaSala(datos)) return;

    const solapadas = await tx.reservas.buscarSolapadas({ ...datos, excluirId });
    if (solapadas.length > 0) {
      throw new ConflictError('RESERVA_SOLAPADA', 'La sala ya está reservada en ese horario', {
        conflictos: solapadas.map(({ id, inicio, fin, responsable }) => ({ id, inicio, fin, responsable })),
      });
    }
  };

  const conflictoVersion = (actual, version) =>
    new ConflictError('CONFLICTO_VERSION', 'La reserva fue modificada por otro usuario; recargue e intente de nuevo', {
      versionEnviada: version,
      versionActual: actual.version,
    });

  /** Patrón común de PUT y PATCH: bloquear, construir el nuevo estado, validar y guardar. */
  const actualizarCon = async (id, version, construirNueva) => {
    const { anterior, nueva } = await store.transaccion(async (tx) => {
      const actual = await tx.reservas.buscarPorId(id, { bloquear: true });
      if (!actual) throw new NotFoundError('Reserva', id);
      if (actual.version !== version) throw conflictoVersion(actual, version);

      const datos = dominio.datosPersistibles(construirNueva(actual));
      await asegurarDisponibilidad(tx, datos, id);
      const guardada = await tx.reservas.actualizar(id, datos, version);
      if (!guardada) throw conflictoVersion(actual, version);
      return { anterior: actual, nueva: guardada };
    });
    notificador.emitir(dominio.eventoDeActualizacion(anterior, nueva), nueva);
    return nueva;
  };

  /* ---------- Casos de uso ---------- */

  const listar = async (query) => {
    const filtros = exigir(dominio.validarFiltros(query));
    const { items, total } = await store.reservas.listar(filtros, dominio.paginacion(filtros));
    return { items, meta: dominio.metaPaginacion(filtros, total) };
  };

  const obtener = async (id) => {
    const reserva = await store.reservas.buscarPorId(id);
    if (!reserva) throw new NotFoundError('Reserva', id);
    return reserva;
  };

  const guardarNueva = (datos) =>
    store.transaccion(async (tx) => {
      await asegurarDisponibilidad(tx, datos);
      return tx.reservas.insertar(datos);
    });

  const crear = async (entrada) => {
    const datos = exigir(dominio.validarCreacion(entrada));
    const reserva = await guardarNueva(datos);
    notificador.emitir('reserva:creada', reserva);
    return reserva;
  };

  const reemplazar = (id, entrada) => {
    const { version, datos } = dominio.separarVersion(exigir(dominio.validarReemplazo(entrada)));
    return actualizarCon(id, version, () => datos);
  };

  const modificar = (id, entrada) => {
    const { version, datos: cambios } = dominio.separarVersion(exigir(dominio.validarParche(entrada)));
    return actualizarCon(id, version, (actual) => exigir(dominio.validarFusion(dominio.aplicarCambios(actual, cambios))));
  };

  const eliminar = async (id) => {
    const eliminada = await store.reservas.eliminar(id);
    if (!eliminada) throw new NotFoundError('Reserva', id);
    notificador.emitir('reserva:eliminada', { id });
  };

  /* ---------- Funciones de archivo (CSV) ---------- */

  const exportarCsv = async (query) => {
    const { pagina, limite, ...filtros } = exigir(dominio.validarFiltros(query));
    return reservasACsv(await store.reservas.listarTodas(filtros));
  };

  const resultadoDeFallo = (fila, error) =>
    error instanceof AppError
      ? { fila, ok: false, error: { code: error.code, message: error.message, details: error.details } }
      : { fila, ok: false, error: { code: 'ERROR_INTERNO', message: 'Error inesperado' } };

  const importarFila = async ({ fila, datos }) => {
    try {
      const reserva = await guardarNueva(exigir(dominio.validarCreacion(datos)));
      return { fila, ok: true, reserva };
    } catch (error) {
      return resultadoDeFallo(fila, error);
    }
  };

  /** Importa secuencialmente (cada fila en su propia transacción) y reporta fila por fila. */
  const importarCsv = async (texto) => {
    const entradas = exigir(csvAEntradas(texto));
    if (entradas.length === 0) throw new ValidationError([{ campo: 'archivo', mensaje: 'no contiene filas' }]);
    if (entradas.length > MAX_FILAS_IMPORTACION) {
      throw new ValidationError([{ campo: 'archivo', mensaje: `máximo ${MAX_FILAS_IMPORTACION} filas` }]);
    }
    const resultados = await entradas.reduce(
      async (acumulado, entrada) => [...(await acumulado), await importarFila(entrada)],
      Promise.resolve([]),
    );
    const creadas = resultados.filter((r) => r.ok).map((r) => r.reserva);
    const errores = resultados.filter((r) => !r.ok).map(({ fila, error }) => ({ fila, ...error }));
    const resumen = { total: entradas.length, creadas: creadas.length, fallidas: errores.length };

    if (creadas.length > 0) notificador.emitir('reservas:importadas', { ...resumen, ids: creadas.map((r) => r.id) });
    return { ...resumen, reservas: creadas, errores };
  };

  return Object.freeze({ listar, obtener, crear, reemplazar, modificar, eliminar, exportarCsv, importarCsv });
};

module.exports = { crearReservaService };

