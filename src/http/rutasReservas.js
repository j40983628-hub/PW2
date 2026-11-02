'use strict';

const express = require('express');
const multer = require('multer');
const { idDe, enviar, creado } = require('./respuestas');
const { ValidationError } = require('../domain/errores');

const esCsv = (archivo) =>
  /\.csv$/i.test(archivo.originalname) || ['text/csv', 'application/vnd.ms-excel'].includes(archivo.mimetype);

const subidaCsv = multer({
  storage: multer.memoryStorage(), // el archivo nunca toca el disco del servidor
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (req, archivo, cb) =>
    esCsv(archivo)
      ? cb(null, true)
      : cb(new ValidationError([{ campo: 'archivo', mensaje: 'debe ser un archivo .csv' }])),
});

const crearRutasReservas = (servicio) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { items, meta } = await servicio.listar(req.query);
    enviar(res, 200, items, meta);
  });

  // Funciones de archivo: deben declararse antes de "/:id".
  router.get('/exportar', async (req, res) => {
    const csv = await servicio.exportarCsv(req.query);
    res.attachment('reservas.csv').type('text/csv; charset=utf-8').send(`\uFEFF${csv}`);
  });

  router.post('/importar', subidaCsv.single('archivo'), async (req, res) => {
    if (!req.file) throw new ValidationError([{ campo: 'archivo', mensaje: 'adjunte un archivo CSV en el campo "archivo"' }]);
    enviar(res, 200, await servicio.importarCsv(req.file.buffer.toString('utf8')));
  });

  router.get('/:id', async (req, res) => enviar(res, 200, await servicio.obtener(idDe(req))));
  router.post('/', async (req, res) => creado(req, res, await servicio.crear(req.body)));
  router.put('/:id', async (req, res) => enviar(res, 200, await servicio.reemplazar(idDe(req), req.body)));
  router.patch('/:id', async (req, res) => enviar(res, 200, await servicio.modificar(idDe(req), req.body)));
  router.delete('/:id', async (req, res) => {
    await servicio.eliminar(idDe(req));
    res.status(204).end();
  });

  return router;
};

module.exports = { crearRutasReservas };

