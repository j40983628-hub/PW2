'use strict';

/*
 * Mini librería de validación 100 % pura: no lanza excepciones ni hace E/S.
 * Toda función devuelve { ok: true, value } o { ok: false, errors: [{ campo, mensaje }] }.
 */

const FECHA_HORA_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const partesFecha = (texto) => {
  const m = FECHA_HORA_RE.exec(texto);
  if (!m) return null;
  const [anio, mes, dia, hora, minuto, segundo = '00'] = m.slice(1);
  return { anio: +anio, mes: +mes, dia: +dia, hora: +hora, minuto: +minuto, segundo: +segundo };
};

const aMilisegundos = (texto) => {
  const p = partesFecha(texto);
  return Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
};

const esFechaHoraValida = (texto) => {
  if (typeof texto !== 'string') return false;
  const p = partesFecha(texto);
  if (!p) return false;
  const d = new Date(aMilisegundos(texto));
  return (
    d.getUTCFullYear() === p.anio &&
    d.getUTCMonth() === p.mes - 1 &&
    d.getUTCDate() === p.dia &&
    d.getUTCHours() === p.hora &&
    d.getUTCMinutes() === p.minuto &&
    d.getUTCSeconds() === p.segundo
  );
};

const dos = (n) => String(n).padStart(2, '0');

/** '2026-11-05 9:00' -> '2026-11-05T09:00:00' (formato interno canónico). */
const normalizarFechaHora = (texto) => {
  const p = partesFecha(texto);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}T${dos(p.hora)}:${dos(p.minuto)}:${dos(p.segundo)}`;
};

/** Valor DATETIME de la BD ('YYYY-MM-DD HH:mm:ss') -> ISO local sin zona. */
const aIso = (valor) => (valor == null ? null : String(valor).replace(' ', 'T').slice(0, 19));

/** ISO interno -> literal DATETIME para la BD. */
const aSql = (iso) => iso.replace('T', ' ');

const reglas = Object.freeze({
  texto: ({ min = 1, max = 255 } = {}) => (v) => {
    if (typeof v !== 'string') return 'debe ser una cadena de texto';
    const largo = v.trim().length;
    if (largo < min) return min === 1 ? 'no puede estar vacío' : `debe tener al menos ${min} caracteres`;
    if (largo > max) return `debe tener como máximo ${max} caracteres`;
    return null;
  },
  entero: ({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => (v) => {
    if (!Number.isInteger(v)) return 'debe ser un número entero';
    if (v < min) return `debe ser mayor o igual a ${min}`;
    if (v > max) return `debe ser menor o igual a ${max}`;
    return null;
  },
  fechaHora: () => (v) =>
    esFechaHoraValida(v) ? null : 'debe ser una fecha-hora válida con formato YYYY-MM-DDTHH:mm[:ss]',
  enumeracion: (valores) => (v) => (valores.includes(v) ? null : `debe ser uno de: ${valores.join(', ')}`),
});

const normalizadores = Object.freeze({
  recortar: (v) => v.trim(),
  fechaHora: normalizarFechaHora,
});

const esObjetoPlano = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const evaluarCampo = (campo, def, valor, parcial) => {
  if (valor === undefined || valor === null) {
    if (def.requerido && (!parcial || def.siempreRequerido)) return { campo, error: 'es obligatorio' };
    if (def.defecto !== undefined && !parcial) return { campo, valor: def.defecto };
    return { campo };
  }
  const error = def.regla(valor);
  if (error) return { campo, error };
  return { campo, valor: def.normalizar ? def.normalizar(valor) : valor };
};

/**
 * Valida `entrada` contra `esquema`.
 * esquema: { campo: { regla, requerido?, siempreRequerido?, defecto?, normalizar? } }
 * parcial: para PATCH; los campos ausentes se ignoran y no se aplican valores por defecto.
 */
const validar = (entrada, esquema, { parcial = false } = {}) => {
  if (!esObjetoPlano(entrada)) {
    return { ok: false, errors: [{ campo: '(cuerpo)', mensaje: 'debe ser un objeto JSON' }] };
  }
  const desconocidos = Object.keys(entrada)
    .filter((k) => !Object.hasOwn(esquema, k))
    .map((k) => ({ campo: k, mensaje: 'campo no permitido' }));

  const resultados = Object.entries(esquema).map(([campo, def]) =>
    evaluarCampo(campo, def, entrada[campo], parcial),
  );

  const errors = [
    ...desconocidos,
    ...resultados.filter((r) => r.error).map((r) => ({ campo: r.campo, mensaje: r.error })),
  ];
  if (errors.length > 0) return { ok: false, errors };

  const value = Object.freeze(
    Object.fromEntries(resultados.filter((r) => r.valor !== undefined).map((r) => [r.campo, r.valor])),
  );
  return { ok: true, value };
};

const parsearId = (texto) =>
  /^[1-9]\d{0,9}$/.test(String(texto))
    ? { ok: true, value: Number(texto) }
    : { ok: false, errors: [{ campo: 'id', mensaje: 'debe ser un entero positivo' }] };

module.exports = {
  reglas,
  normalizadores,
  validar,
  parsearId,
  esFechaHoraValida,
  normalizarFechaHora,
  aMilisegundos,
  aIso,
  aSql,
};

