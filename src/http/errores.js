'use strict';

const multer = require('multer');
const { AppError } = require('../domain/errores');

/** Clasifica cualquier error en { status, code, message, details }. Pura. */
const clasificarError = (err) => {
  if (err instanceof AppError) return { status: err.status, code: err.code, message: err.message, details: err.details };
  if (err.type === 'entity.parse.failed') {
    return { status: 400, code: 'JSON_INVALIDO', message: 'El cuerpo de la petición no es JSON válido' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, code: 'CARGA_DEMASIADO_GRANDE', message: 'El cuerpo de la petición es demasiado grande' };
  }
  if (err instanceof multer.MulterError) {
    return {
      status: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
      code: 'ARCHIVO_INVALIDO',
      message: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo (1 MB)' : err.message,
    };
  }
  return { status: 500, code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado' };
};

/** Formato uniforme de error de toda la API. Pura (recibe la fecha). */
const cuerpoError = ({ status, code, message, details }, ruta, fecha) => ({
  error: {
    status,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    path: ruta,
    timestamp: fecha.toISOString(),
  },
});

const rutaNoEncontrada = (req, res) => {
  if (res.headersSent) return;
  res
    .status(404)
    .json(
      cuerpoError(
        { status: 404, code: 'RUTA_NO_ENCONTRADA', message: `No existe ${req.method} ${req.path}` },
        req.originalUrl,
        new Date(),
      ),
    );
};

const manejadorErrores =
  (logger = console) =>
  // eslint-disable-next-line no-unused-vars
  (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const clasificado = clasificarError(err);
    if (clasificado.status >= 500) logger.error(err);
    return res.status(clasificado.status).json(cuerpoError(clasificado, req.originalUrl, new Date()));
  };

module.exports = { clasificarError, cuerpoError, rutaNoEncontrada, manejadorErrores };

