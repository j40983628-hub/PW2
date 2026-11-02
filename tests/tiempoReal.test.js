'use strict';

const request = require('supertest');
const { io: conectar } = require('socket.io-client');
const { crearServidor } = require('../src/servidor');
const { crearMemoryStore } = require('../src/repositories/memory');
const { salaValida, reservaValida } = require('./helpers');

describe('Eventos en tiempo real (Socket.IO)', () => {
  let servidor;
  let io;
  let cliente;

  beforeAll(async () => {
    ({ servidor, io } = crearServidor({ store: crearMemoryStore(), logger: { error() {}, info() {} } }));
    await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    cliente = conectar(`http://127.0.0.1:${servidor.address().port}`, { transports: ['websocket'] });
    await new Promise((resolve) => cliente.on('connect', resolve));
  });

  afterAll(async () => {
    cliente.close();
    io.close();
    await new Promise((resolve) => servidor.close(resolve));
  });

  const esperarEvento = (nombre) => new Promise((resolve) => cliente.once(nombre, resolve));

  test('crear y cancelar una reserva notifica a los clientes conectados', async () => {
    const sala = (await request(servidor).post('/api/salas').send(salaValida())).body.data;

    const creada = esperarEvento('reserva:creada');
    const { body } = await request(servidor).post('/api/reservas').send(reservaValida(sala.id));
    const mensaje = await creada;
    expect(mensaje).toMatchObject({ evento: 'reserva:creada', datos: { id: body.data.id } });
    expect(new Date(mensaje.timestamp).toString()).not.toBe('Invalid Date');

    const cancelada = esperarEvento('reserva:cancelada');
    await request(servidor).patch(`/api/reservas/${body.data.id}`).send({ estado: 'cancelada', version: 1 });
    expect((await cancelada).datos).toMatchObject({ id: body.data.id, estado: 'cancelada', version: 2 });
  });
});

