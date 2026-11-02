'use strict';

const { crearApp } = require('../src/app');
const { crearMemoryStore } = require('../src/repositories/memory');

/** App con store en memoria y notificador espía que registra los eventos emitidos. */
const crearContexto = () => {
  const eventos = [];
  const notificador = { emitir: (evento, datos) => eventos.push({ evento, datos }) };
  const store = crearMemoryStore();
  const logger = { error: () => {}, info: () => {} };
  return { app: crearApp({ store, notificador, logger }), store, eventos };
};

const salaValida = (extra = {}) => ({ nombre: 'Sala Andes', capacidad: 10, ubicacion: 'Bloque A', ...extra });

const reservaValida = (salaId, extra = {}) => ({
  salaId,
  responsable: 'Ana Pérez',
  motivo: 'Reunión de equipo',
  inicio: '2026-11-10T09:00',
  fin: '2026-11-10T10:00',
  asistentes: 5,
  ...extra,
});

module.exports = { crearContexto, salaValida, reservaValida };

