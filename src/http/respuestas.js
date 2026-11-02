'use strict';

const { parsearId } = require('../domain/validacion');
const { exigir } = require('../domain/errores');

/** Extrae y valida :id de la ruta. */
const idDe = (req) => exigir(parsearId(req.params.id));

/** Formato uniforme de éxito: { data, meta? }. */
const enviar = (res, status, data, meta) => res.status(status).json(meta ? { data, meta } : { data });

/** 201 Created + cabecera Location del nuevo recurso. */
const creado = (req, res, recurso) => enviar(res.location(`${req.baseUrl}/${recurso.id}`), 201, recurso);

module.exports = { idDe, enviar, creado };
