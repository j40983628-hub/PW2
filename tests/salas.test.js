'use strict';

const request = require('supertest');
const { crearContexto, salaValida, reservaValida } = require('./helpers');

describe('API /api/salas', () => {
  let ctx;
  beforeEach(() => {
    ctx = crearContexto();
  });

  test('POST crea una sala (201 + Location + evento)', async () => {
    const res = await request(ctx.app).post('/api/salas').send(salaValida());
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/salas/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ nombre: 'Sala Andes', capacidad: 10 });
    expect(ctx.eventos.map((e) => e.evento)).toEqual(['sala:creada']);
  });

  test('POST con datos inválidos -> 400 con formato uniforme', async () => {
    const res = await request(ctx.app).post('/api/salas').send({ nombre: '', capacidad: 0, color: 'rojo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ status: 400, code: 'VALIDACION', path: '/api/salas' });
    expect(res.body.error.details.map((d) => d.campo).sort()).toEqual(['capacidad', 'color', 'nombre']);
    expect(res.body.error.timestamp).toBeDefined();
  });

  test('JSON mal formado -> 400 JSON_INVALIDO', async () => {
    const res = await request(ctx.app).post('/api/salas').set('Content-Type', 'application/json').send('{"nombre":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('JSON_INVALIDO');
  });

  test('nombre duplicado -> 409 SALA_DUPLICADA', async () => {
    await request(ctx.app).post('/api/salas').send(salaValida());
    const res = await request(ctx.app).post('/api/salas').send(salaValida({ nombre: 'sala andes' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SALA_DUPLICADA');
  });

  test('GET lista y obtiene por id; 404 si no existe; 400 si id inválido', async () => {
    const { body } = await request(ctx.app).post('/api/salas').send(salaValida());
    expect((await request(ctx.app).get('/api/salas')).body.data).toHaveLength(1);
    expect((await request(ctx.app).get(`/api/salas/${body.data.id}`)).status).toBe(200);
    const noExiste = await request(ctx.app).get('/api/salas/999');
    expect(noExiste.status).toBe(404);
    expect(noExiste.body.error.code).toBe('NO_ENCONTRADO');
    expect((await request(ctx.app).get('/api/salas/abc')).status).toBe(400);
  });

  test('PUT reemplaza la sala', async () => {
    const { body } = await request(ctx.app).post('/api/salas').send(salaValida());
    const res = await request(ctx.app).put(`/api/salas/${body.data.id}`).send(salaValida({ capacidad: 30 }));
    expect(res.status).toBe(200);
    expect(res.body.data.capacidad).toBe(30);
  });

  test('DELETE 204; 409 si tiene reservas asociadas', async () => {
    const a = (await request(ctx.app).post('/api/salas').send(salaValida())).body.data;
    const b = (await request(ctx.app).post('/api/salas').send(salaValida({ nombre: 'Sala B' }))).body.data;
    await request(ctx.app).post('/api/reservas').send(reservaValida(b.id));

    expect((await request(ctx.app).delete(`/api/salas/${a.id}`)).status).toBe(204);
    const conflicto = await request(ctx.app).delete(`/api/salas/${b.id}`);
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.error.code).toBe('RECURSO_REFERENCIADO');
  });

  test('ruta inexistente -> 404 RUTA_NO_ENCONTRADA', async () => {
    const res = await request(ctx.app).get('/api/nada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUTA_NO_ENCONTRADA');
  });
});

