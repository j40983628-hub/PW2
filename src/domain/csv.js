'use strict';

/* Transformaciones puras entre reservas y texto CSV (sin E/S). */

const COLUMNAS_EXPORTACION = Object.freeze([
  ['id', (r) => r.id],
  ['salaId', (r) => r.salaId],
  ['sala', (r) => r.salaNombre],
  ['responsable', (r) => r.responsable],
  ['motivo', (r) => r.motivo],
  ['inicio', (r) => r.inicio],
  ['fin', (r) => r.fin],
  ['asistentes', (r) => r.asistentes],
  ['estado', (r) => r.estado],
  ['version', (r) => r.version],
]);

const COLUMNAS_IMPORTACION = Object.freeze(['salaId', 'responsable', 'motivo', 'inicio', 'fin', 'asistentes']);
const COLUMNAS_OBLIGATORIAS = Object.freeze(['salaId', 'responsable', 'inicio', 'fin']);
const COLUMNAS_NUMERICAS = Object.freeze(['salaId', 'asistentes']);

/** Evita "CSV injection" cuando el archivo se abre en Excel/LibreOffice. */
const neutralizarFormula = (texto) => (/^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto);

const escaparCelda = (valor) => {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'string' ? neutralizarFormula(valor) : String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

const reservasACsv = (reservas) =>
  [
    COLUMNAS_EXPORTACION.map(([nombre]) => nombre).join(','),
    ...reservas.map((r) => COLUMNAS_EXPORTACION.map(([, obtener]) => escaparCelda(obtener(r))).join(',')),
  ].join('\r\n') + '\r\n';

/**
 * Parser CSV (RFC 4180 básico: comillas, comillas escapadas y saltos CRLF/LF).
 * Usa variables locales mutables, pero no tiene efectos fuera de la función.
 */
const parsearCsv = (texto) => {
  const fuente = texto.replace(/^\uFEFF/, '');
  const filas = [];
  let fila = [];
  let celda = '';
  let enComillas = false;

  for (let i = 0; i < fuente.length; i += 1) {
    const c = fuente[i];
    if (enComillas) {
      if (c === '"' && fuente[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else if (c === '"') {
        enComillas = false;
      } else {
        celda += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && fuente[i + 1] === '\n') i += 1;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += c;
    }
  }
  if (celda !== '' || fila.length > 0) filas.push([...fila, celda]);
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
};

const convertirCelda = (columna, valor) => {
  const limpio = valor.trim();
  return COLUMNAS_NUMERICAS.includes(columna) && /^\d+$/.test(limpio) ? Number(limpio) : limpio;
};

const filaAEntrada = (columnas, celdas) =>
  Object.fromEntries(
    columnas
      .map((columna, i) => [columna, celdas[i]])
      .filter(([columna, valor]) => COLUMNAS_IMPORTACION.includes(columna) && valor !== undefined && valor.trim() !== '')
      .map(([columna, valor]) => [columna, convertirCelda(columna, valor)]),
  );

/** Texto CSV -> [{ fila, datos }]. Ignora columnas extra (p. ej. las de la exportación). */
const csvAEntradas = (texto) => {
  const [encabezado = [], ...filas] = parsearCsv(texto);
  const columnas = encabezado.map((c) => c.trim());
  const faltantes = COLUMNAS_OBLIGATORIAS.filter((c) => !columnas.includes(c));
  if (faltantes.length > 0) {
    return { ok: false, errors: [{ campo: 'archivo', mensaje: `faltan columnas: ${faltantes.join(', ')}` }] };
  }
  return {
    ok: true,
    value: filas.map((celdas, i) => ({ fila: i + 2, datos: filaAEntrada(columnas, celdas) })),
  };
};

module.exports = { reservasACsv, parsearCsv, csvAEntradas, escaparCelda };

