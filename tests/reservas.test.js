'use strict';

const request = require('supertest');
const { crearContexto, salaValida, reservaValida } = require('./helpers');

describe('API /api/reservas', () => {
  let ctx;
  let sala;

  const crearReserva = (extra) => request(ctx.app).post('/api/reservas').send(reservaValida(sala.id, extra));

  beforeEach(async () => {
    ctx = crearContexto();
    sala = (await request(ctx.app).post('/api/salas').send(salaValida())).body.data;
    ctx.eventos.length = 0;
  });

  describe('POST', () => {
    test('crea una reserva normalizando fechas (201 + evento reserva:creada)', async () => {
      const res = await crearReserva();
      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/api/reservas/${res.body.data.id}`);
      expect(res.body.data).toMatchObject({
        salaId: sala.id,
        salaNombre: 'Sala Andes',
        inicio: '2026-11-10T09:00:00',
        estado: 'confirmada',
        version: 1,
      });
      expect(ctx.eventos).toEqual([{ evento: 'reserva:creada', datos: res.body.data }]);
    });

    test('400 si fin <= inicio', async () => {
      const res = await crearReserva({ fin: '2026-11-10T08:00' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ campo: 'fin', mensaje: 'debe ser posterior a inicio' }]);
    });

    test('400 si faltan campos obligatorios', async () => {
      const res = await request(ctx.app).post('/api/reservas').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.campo)).toEqual(
        expect.arrayContaining(['salaId', 'responsable', 'inicio', 'fin']),
      );
    });

    test('409 RESERVA_SOLAPADA si choca con otra reserva confirmada', async () => {
      const primera = (await crearReserva()).body.data;
      const res = await crearReserva({ inicio: '2026-11-10T09:30', fin: '2026-11-10T11:00' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESERVA_SOLAPADA');
      expect(res.body.error.details.conflictos[0].id).toBe(primera.id);
    });

    test('permite reservas contiguas', async () => {
      await crearReserva();
      const res = await crearReserva({ inicio: '2026-11-10T10:00', fin: '2026-11-10T11:00' });
      expect(res.status).toBe(201);
    });

    test('peticiones concurrentes sobre el mismo horario: solo una gana', async () => {
      const respuestas = await Promise.all([crearReserva(), crearReserva(), crearReserva()]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    test('422 CAPACIDAD_EXCEDIDA y 422 SALA_INEXISTENTE', async () => {
      const capacidad = await crearReserva({ asistentes: 50 });
      expect(capacidad.status).toBe(422);
      expect(capacidad.body.error).toMatchObject({ code: 'CAPACIDAD_EXCEDIDA', details: { capacidad: 10, asistentes: 50 } });

      const sinSala = await request(ctx.app).post('/api/reservas').send(reservaValida(999));
      expect(sinSala.status).toBe(422);
      expect(sinSala.body.error.code).toBe('SALA_INEXISTENTE');
    });
  });

  describe('GET', () => {
    test('lista con filtros y paginación', async () => {
      await crearReserva();
      await crearReserva({ inicio: '2026-11-11T09:00', fin: '2026-11-11T10:00' });
      await crearReserva({ inicio: '2026-11-12T09:00', fin: '2026-11-12T10:00' });

      const res = await request(ctx.app).get('/api/reservas').query({ limite: 2, pagina: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toEqual({ pagina: 1, limite: 2, total: 3, totalPaginas: 2 });

      const filtrado = await request(ctx.app)
        .get('/api/reservas')
        .query({ desde: '2026-11-11T00:00', hasta: '2026-11-12T00:00' });
      expect(filtrado.body.data.map((r) => r.inicio)).toEqual(['2026-11-11T09:00:00']);
    });

    test('400 con filtros inválidos', async () => {
      const res = await request(ctx.app).get('/api/reservas').query({ limite: 500, estado: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.campo).sort()).toEqual(['estado', 'limite']);
    });

    test('GET /:id 200 y 404', async () => {
      const { id } = (await crearReserva()).body.data;
      expect((await request(ctx.app).get(`/api/reservas/${id}`)).body.data.id).toBe(id);
      expect((await request(ctx.app).get('/api/reservas/77')).status).toBe(404);
    });
  });

  describe('PUT / PATCH (bloqueo optimista)', () => {
    test('PUT reemplaza e incrementa la versión', async () => {
      const r = (await crearReserva()).body.data;
      const res = await request(ctx.app)
        .put(`/api/reservas/${r.id}`)
        .send({ ...reservaValida(sala.id, { responsable: 'Luis Mora' }), version: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ responsable: 'Luis Mora', version: 2 });
      expect(ctx.eventos.at(-1).evento).toBe('reserva:actualizada');
    });

    test('PUT sin version -> 400; con version vieja -> 409 CONFLICTO_VERSION', async () => {
      const r = (await crearReserva()).body.data;
      const sinVersion = await request(ctx.app).put(`/api/reservas/${r.id}`).send(reservaValida(sala.id));
      expect(sinVersion.status).toBe(400);

      await request(ctx.app).patch(`/api/reservas/${r.id}`).send({ motivo: 'Cambio A', version: 1 });
      const vieja = await request(ctx.app).patch(`/api/reservas/${r.id}`).send({ motivo: 'Cambio B', version: 1 });
      expect(vieja.status).toBe(409);
      expect(vieja.body.error).toMatchObject({
        code: 'CONFLICTO_VERSION',
        details: { versionEnviada: 1, versionActual: 2 },
      });
    });

    test('PATCH valida el rango resultante de la fusión', async () => {
      const r = (await crearReserva()).body.data;
      const res = await request(ctx.app).patch(`/api/reservas/${r.id}`).send({ fin: '2026-11-10T08:00', version: 1 });
      expect(res.status).toBe(400);
    });

    test('PATCH estado=cancelada emite reserva:cancelada y libera el horario', async () => {
      const r = (await crearReserva()).body.data;
      const res = await request(ctx.app).patch(`/api/reservas/${r.id}`).send({ estado: 'cancelada', version: 1 });
      expect(res.status).toBe(200);
      expect(ctx.eventos.at(-1).evento).toBe('reserva:cancelada');
      expect((await crearReserva()).status).toBe(201);
    });

    test('PATCH que mueve la reserva a un horario ocupado -> 409', async () => {
      await crearReserva();
      const otra = (await crearReserva({ inicio: '2026-11-10T11:00', fin: '2026-11-10T12:00' })).body.data;
      const res = await request(ctx.app)
        .patch(`/api/reservas/${otra.id}`)
        .send({ inicio: '2026-11-10T09:30', version: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESERVA_SOLAPADA');
    });
  });

  describe('DELETE', () => {
    test('204 y luego 404', async () => {
      const { id } = (await crearReserva()).body.data;
      expect((await request(ctx.app).delete(`/api/reservas/${id}`)).status).toBe(204);
      expect(ctx.eventos.at(-1)).toEqual({ evento: 'reserva:eliminada', datos: { id } });
      expect((await request(ctx.app).delete(`/api/reservas/${id}`)).status).toBe(404);
    });
  });

  describe('Archivos CSV', () => {
    test('GET /exportar descarga un CSV', async () => {
      await crearReserva();
      const res = await request(ctx.app).get('/api/reservas/exportar');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/reservas\.csv/);
      expect(res.text).toContain('id,salaId,sala,responsable,motivo,inicio,fin,asistentes,estado,version');
      expect(res.text).toContain('Ana Pérez');
    });

    test('POST /importar crea las filas válidas y reporta las erróneas', async () => {
      const csv = [
        'salaId,responsable,motivo,inicio,fin,asistentes',
        `${sala.id},Ana Pérez,Demo,2026-11-20T09:00,2026-11-20T10:00,4`,
        `${sala.id},Luis Mora,Choque,2026-11-20T09:30,2026-11-20T10:30,2`,
        `${sala.id},X,,2026-11-21T09:00,2026-11-21T10:00,2`,
      ].join('\n');
      const res = await request(ctx.app)
        .post('/api/reservas/importar')
        .attach('archivo', Buffer.from(csv), { filename: 'reservas.csv', contentType: 'text/csv' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ total: 3, creadas: 1, fallidas: 2 });
      expect(res.body.data.errores.map((e) => [e.fila, e.code])).toEqual([
        [3, 'RESERVA_SOLAPADA'],
        [4, 'VALIDACION'],
      ]);
      expect(ctx.eventos.at(-1).evento).toBe('reservas:importadas');
    });

    test('POST /importar sin archivo o con extensión inválida -> 400', async () => {
      expect((await request(ctx.app).post('/api/reservas/importar')).status).toBe(400);
      const res = await request(ctx.app)
        .post('/api/reservas/importar')
        .attach('archivo', Buffer.from('hola'), { filename: 'virus.exe', contentType: 'application/octet-stream' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDACION');
    });
  });
});

