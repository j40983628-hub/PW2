'use strict';

/*
 * Pruebas de integración contra una instancia REAL de MariaDB.
 * Ejecutar con:  npm run test:db   (requiere la BD creada; ¡vacía las tablas!)
 */
const request = require('supertest');
const config = require('../src/config');
const { crearApp } = require('../src/app');
const { crearPool, crearMariaDbStore } = require('../src/repositories/mariadb');
const { salaValida, reservaValida } = require('./helpers');

describe('Integración con MariaDB', () => {
  let pool;
  let app;
  let eventos;

  beforeAll(async () => {
    pool = crearPool(config.db);
    await pool.query('DELETE FROM reservas');
    await pool.query('DELETE FROM salas');
    eventos = [];
    app = crearApp({
      store: crearMariaDbStore(pool),
      notificador: { emitir: (evento) => eventos.push(evento) },
      logger: { error: console.error },
    });
  });

  afterAll(() => pool.end());

  test('flujo completo con conflictos', async () => {
    const health = await request(app).get('/health');
    expect(health.body.data.baseDeDatos).toBe('ok');

    const sala = (await request(app).post('/api/salas').send(salaValida())).body.data;
    expect(sala.id).toEqual(expect.any(Number));
    expect((await request(app).post('/api/salas').send(salaValida())).body.error.code).toBe('SALA_DUPLICADA');

    const creada = await request(app).post('/api/reservas').send(reservaValida(sala.id));
    expect(creada.status).toBe(201);
    expect(creada.body.data.inicio).toBe('2026-11-10T09:00:00');

    const concurrentes = await Promise.all(
      [1, 2, 3].map(() =>
        request(app).post('/api/reservas').send(reservaValida(sala.id, { inicio: '2026-11-11T09:00', fin: '2026-11-11T10:00' })),
      ),
    );
    expect(concurrentes.map((r) => r.status).sort()).toEqual([201, 409, 409]);

    const id = creada.body.data.id;
    expect((await request(app).patch(`/api/reservas/${id}`).send({ motivo: 'X', version: 1 })).body.data.version).toBe(2);
    expect((await request(app).patch(`/api/reservas/${id}`).send({ motivo: 'Y', version: 1 })).status).toBe(409);

    const lista = await request(app).get('/api/reservas').query({ salaId: sala.id, limite: 1 });
    expect(lista.body.meta.total).toBe(2);

    expect((await request(app).delete(`/api/salas/${sala.id}`)).body.error.code).toBe('RECURSO_REFERENCIADO');
    expect((await request(app).get('/api/reservas/exportar')).text).toContain('Ana Pérez');
    expect(eventos).toContain('reserva:creada');
  });
});

