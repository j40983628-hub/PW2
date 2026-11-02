'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { crearSalaService } = require('./services/salaService');
const { crearReservaService } = require('./services/reservaService');
const { crearRutasSalas } = require('./http/rutasSalas');
const { crearRutasReservas } = require('./http/rutasReservas');
const { rutaNoEncontrada, manejadorErrores } = require('./http/errores');

/**
 * Fábrica de la aplicación Express. Recibe sus dependencias (inyección), por lo
 * que las pruebas pueden usar un store en memoria y un notificador falso.
 */
const crearApp = ({ store, notificador, logger = console, corsOrigin = '*' }) => {
  const salas = crearSalaService({ store, notificador });
  const reservas = crearReservaService({ store, notificador });

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', async (req, res) => {
    try {
      await store.ping();
      res.json({ data: { estado: 'ok', baseDeDatos: 'ok' } });
    } catch {
      res.status(503).json({ data: { estado: 'degradado', baseDeDatos: 'sin conexión' } });
    }
  });

  app.use('/api/salas', crearRutasSalas(salas));
  app.use('/api/reservas', crearRutasReservas(reservas));

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores(logger));
  return app;
};

module.exports = { crearApp };

