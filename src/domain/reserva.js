'use strict';

const { reglas, normalizadores, validar, aMilisegundos } = require('./validacion');

/* ------------------------------------------------------------------ */
/* Reglas y esquemas                                                  */
/* ------------------------------------------------------------------ */

const ESTADOS = Object.freeze(['confirmada', 'cancelada']);
const DURACION_MAXIMA_HORAS = 12;
const LIMITE_MAXIMO_PAGINA = 100;

const esquemaReserva = Object.freeze({
  salaId: { requerido: true, regla: reglas.entero({ min: 1 }) },
  responsable: { requerido: true, regla: reglas.texto({ min: 3, max: 100 }), normalizar: normalizadores.recortar },
  motivo: { regla: reglas.texto({ min: 0, max: 255 }), normalizar: normalizadores.recortar, defecto: null },
  inicio: { requerido: true, regla: reglas.fechaHora(), normalizar: normalizadores.fechaHora },
  fin: { requerido: true, regla: reglas.fechaHora(), normalizar: normalizadores.fechaHora },
  asistentes: { regla: reglas.entero({ min: 1, max: 1000 }), defecto: 1 },
  estado: { regla: reglas.enumeracion(ESTADOS), defecto: 'confirmada' },
});

/** PUT y PATCH exigen la versión conocida por el cliente (bloqueo optimista). */
const esquemaConVersion = Object.freeze({
  ...esquemaReserva,
  version: { requerido: true, siempreRequerido: true, regla: reglas.entero({ min: 1 }) },
});

const esquemaFiltros = Object.freeze({
  salaId: { regla: reglas.entero({ min: 1 }) },
  estado: { regla: reglas.enumeracion(ESTADOS) },
  desde: { regla: reglas.fechaHora(), normalizar: normalizadores.fechaHora },
  hasta: { regla: reglas.fechaHora(), normalizar: normalizadores.fechaHora },
  pagina: { regla: reglas.entero({ min: 1 }), defecto: 1 },
  limite: { regla: reglas.entero({ min: 1, max: LIMITE_MAXIMO_PAGINA }), defecto: 20 },
});

/* ------------------------------------------------------------------ */
/* Validaciones (puras)                                               */
/* ------------------------------------------------------------------ */

const validarRangoHorario = ({ inicio, fin }) => {
  if (!inicio || !fin) return [];
  if (fin <= inicio) return [{ campo: 'fin', mensaje: 'debe ser posterior a inicio' }];
  const horas = (aMilisegundos(fin) - aMilisegundos(inicio)) / 3_600_000;
  return horas > DURACION_MAXIMA_HORAS
    ? [{ campo: 'fin', mensaje: `la reserva no puede durar más de ${DURACION_MAXIMA_HORAS} horas` }]
    : [];
};

const conRangoValido = (resultado) => {
  if (!resultado.ok) return resultado;
  const errors = validarRangoHorario(resultado.value);
  return errors.length > 0 ? { ok: false, errors } : resultado;
};

const validarCreacion = (entrada) => conRangoValido(validar(entrada, esquemaReserva));
const validarReemplazo = (entrada) => conRangoValido(validar(entrada, esquemaConVersion));
/** El rango de un PATCH se valida después de fusionar con el estado actual. */
const validarParche = (entrada) => validar(entrada, esquemaConVersion, { parcial: true });
const validarFusion = (reserva) => conRangoValido({ ok: true, value: reserva });

const enteroDesdeTexto = (v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);
const CAMPOS_NUMERICOS_FILTRO = ['salaId', 'pagina', 'limite'];

const validarFiltros = (query = {}) => {
  const entrada = Object.fromEntries(
    Object.entries(query).map(([k, v]) => [k, CAMPOS_NUMERICOS_FILTRO.includes(k) ? enteroDesdeTexto(v) : v]),
  );
  const resultado = validar(entrada, esquemaFiltros);
  if (!resultado.ok) return resultado;
  const { desde, hasta } = resultado.value;
  return desde && hasta && hasta <= desde
    ? { ok: false, errors: [{ campo: 'hasta', mensaje: 'debe ser posterior a desde' }] }
    : resultado;
};

/* ------------------------------------------------------------------ */
/* Transformaciones y reglas de negocio (puras)                       */
/* ------------------------------------------------------------------ */

const separarVersion = ({ version, ...datos }) => ({ version, datos });

/** Devuelve un objeto nuevo: nunca muta `actual`. */
const aplicarCambios = (actual, cambios) => Object.freeze({ ...actual, ...cambios });

const datosPersistibles = ({ salaId, responsable, motivo, inicio, fin, asistentes, estado }) =>
  Object.freeze({ salaId, responsable, motivo, inicio, fin, asistentes, estado });

const seSolapan = (a, b) => a.inicio < b.fin && b.inicio < a.fin;
const excedeCapacidad = (sala, reserva) => reserva.asistentes > sala.capacidad;
const ocupaSala = (reserva) => reserva.estado === 'confirmada';

const paginacion = ({ pagina, limite }) => ({ limite, offset: (pagina - 1) * limite });

const metaPaginacion = ({ pagina, limite }, total) => ({
  pagina,
  limite,
  total,
  totalPaginas: Math.ceil(total / limite),
});

/** Determina el evento de tiempo real según la transición de estado. */
const eventoDeActualizacion = (anterior, nueva) =>
  anterior.estado !== 'cancelada' && nueva.estado === 'cancelada' ? 'reserva:cancelada' : 'reserva:actualizada';

module.exports = {
  ESTADOS,
  DURACION_MAXIMA_HORAS,
  validarCreacion,
  validarReemplazo,
  validarParche,
  validarFusion,
  validarFiltros,
  validarRangoHorario,
  separarVersion,
  aplicarCambios,
  datosPersistibles,
  seSolapan,
  excedeCapacidad,
  ocupaSala,
  paginacion,
  metaPaginacion,
  eventoDeActualizacion,
};

