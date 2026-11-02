'use strict';

const http = require('node:http');
const { Server } = require('socket.io');
const { crearApp } = require('./app');
const { crearNotificador, configurarSocket } = require('./realtime/notificador');

/** Ensambla servidor HTTP + Socket.IO + Express sobre un store dado. */
const crearServidor = ({ store, logger = console, corsOrigin = '*' }) => {
  const io = new Server({ cors: { origin: corsOrigin } });
  configurarSocket(io, logger);
  const app = crearApp({ store, notificador: crearNotificador(io), logger, corsOrigin });
  const servidor = http.createServer(app);
  io.attach(servidor);
  return { servidor, io, app };
};

module.exports = { crearServidor };

