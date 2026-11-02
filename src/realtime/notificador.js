'use strict';

/** Construye el sobre de cada evento emitido. Pura (recibe la fecha). */
const crearMensajeEvento = (evento, datos, fecha) => Object.freeze({ evento, datos, timestamp: fecha.toISOString() });

/** Notificador de cambios sobre Socket.IO. Es la única pieza que hace E/S de tiempo real. */
const crearNotificador = (io) =>
  Object.freeze({
    emitir: (evento, datos) => io.emit(evento, crearMensajeEvento(evento, datos, new Date())),
  });

const configurarSocket = (io, logger = console) => {
  io.on('connection', (socket) => {
    logger.info?.(`[socket] cliente conectado ${socket.id}`);
    socket.emit('bienvenida', { id: socket.id, mensaje: 'Conectado a notificaciones de reservas' });
    socket.on('disconnect', () => logger.info?.(`[socket] cliente desconectado ${socket.id}`));
  });
};

module.exports = { crearMensajeEvento, crearNotificador, configurarSocket };

