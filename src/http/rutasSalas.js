'use strict';

const express = require('express');
const { idDe, enviar, creado } = require('./respuestas');

const crearRutasSalas = (servicio) => {
  const router = express.Router();

  router.get('/', async (req, res) => enviar(res, 200, await servicio.listar()));
  router.get('/:id', async (req, res) => enviar(res, 200, await servicio.obtener(idDe(req))));
  router.post('/', async (req, res) => creado(req, res, await servicio.crear(req.body)));
  router.put('/:id', async (req, res) => enviar(res, 200, await servicio.reemplazar(idDe(req), req.body)));
  router.delete('/:id', async (req, res) => {
    await servicio.eliminar(idDe(req));
    res.status(204).end();
  });

  return router;
};

module.exports = { crearRutasSalas };

