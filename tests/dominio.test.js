'use strict';

const v = require('../src/domain/validacion');
const r = require('../src/domain/reserva');
const { reservasACsv, csvAEntradas, parsearCsv } = require('../src/domain/csv');

describe('validación (funciones puras)', () => {
  test('acepta y normaliza fechas válidas', () => {
    expect(v.esFechaHoraValida('2026-11-10T09:00')).toBe(true);
    expect(v.normalizarFechaHora('2026-11-10 09:00')).toBe('2026-11-10T09:00:00');
  });

  test('rechaza fechas imposibles o mal formadas', () => {
    expect(v.esFechaHoraValida('2026-02-30T09:00')).toBe(false);
    expect(v.esFechaHoraValida('10/11/2026 09:00')).toBe(false);
    expect(v.esFechaHoraValida(123)).toBe(false);
  });

  test('validar no muta la entrada y reporta campos desconocidos', () => {
    const entrada = Object.freeze({ nombre: '  X  ', extra: 1 });
    const res = v.validar(entrada, { nombre: { requerido: true, regla: v.reglas.texto() } });
    expect(res.ok).toBe(false);
    expect(res.errors).toContainEqual({ campo: 'extra', mensaje: 'campo no permitido' });
  });

  test('parsearId', () => {
    expect(v.parsearId('15')).toEqual({ ok: true, value: 15 });
    expect(v.parsearId('abc').ok).toBe(false);
    expect(v.parsearId('0').ok).toBe(false);
  });
});

describe('reglas de reserva (puras)', () => {
  test('detecta solapamiento y permite intervalos contiguos', () => {
    const a = { inicio: '2026-11-10T09:00:00', fin: '2026-11-10T10:00:00' };
    expect(r.seSolapan(a, { inicio: '2026-11-10T09:30:00', fin: '2026-11-10T11:00:00' })).toBe(true);
    expect(r.seSolapan(a, { inicio: '2026-11-10T10:00:00', fin: '2026-11-10T11:00:00' })).toBe(false);
  });

  test('fin debe ser posterior a inicio y no superar la duración máxima', () => {
    expect(r.validarRangoHorario({ inicio: '2026-11-10T10:00:00', fin: '2026-11-10T09:00:00' })).toHaveLength(1);
    expect(r.validarRangoHorario({ inicio: '2026-11-10T06:00:00', fin: '2026-11-10T20:00:00' })).toHaveLength(1);
  });

  test('aplicarCambios devuelve un objeto nuevo sin mutar el original', () => {
    const original = Object.freeze({ id: 1, estado: 'confirmada' });
    const nueva = r.aplicarCambios(original, { estado: 'cancelada' });
    expect(nueva).not.toBe(original);
    expect(original.estado).toBe('confirmada');
    expect(nueva.estado).toBe('cancelada');
  });

  test('eventoDeActualizacion distingue cancelaciones', () => {
    expect(r.eventoDeActualizacion({ estado: 'confirmada' }, { estado: 'cancelada' })).toBe('reserva:cancelada');
    expect(r.eventoDeActualizacion({ estado: 'confirmada' }, { estado: 'confirmada' })).toBe('reserva:actualizada');
  });

  test('validarFiltros convierte números de la query string', () => {
    const res = r.validarFiltros({ salaId: '2', pagina: '3' });
    expect(res.value).toMatchObject({ salaId: 2, pagina: 3, limite: 20 });
  });
});

describe('CSV (funciones puras)', () => {
  test('escapa comillas, comas y neutraliza fórmulas', () => {
    const csv = reservasACsv([
      { id: 1, salaId: 1, salaNombre: 'A', responsable: '=HACK()', motivo: 'a, "b"', inicio: 'i', fin: 'f', asistentes: 2, estado: 'confirmada', version: 1 },
    ]);
    expect(csv).toContain("'=HACK()");
    expect(csv).toContain('"a, ""b"""');
  });

  test('parsea comillas y saltos de línea dentro de celdas', () => {
    expect(parsearCsv('a,b\r\n"x,1","y\nz"\r\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'y\nz'],
    ]);
  });

  test('csvAEntradas exige columnas obligatorias y convierte números', () => {
    expect(csvAEntradas('responsable,inicio\nAna,2026').ok).toBe(false);
    const res = csvAEntradas('salaId,responsable,inicio,fin,asistentes\n1,Ana,2026-11-10T09:00,2026-11-10T10:00,3');
    expect(res.value[0]).toEqual({
      fila: 2,
      datos: { salaId: 1, responsable: 'Ana', inicio: '2026-11-10T09:00', fin: '2026-11-10T10:00', asistentes: 3 },
    });
  });
});

