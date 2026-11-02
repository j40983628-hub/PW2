'use strict';

/**
 * Jerarquía de errores de la aplicación. Cada error conoce su código HTTP y un
 * código estable (legible por máquinas) que se devuelve en el formato uniforme.
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(details, message = 'Los datos enviados no son válidos') {
    super(400, 'VALIDACION', message, details);
  }
}

class NotFoundError extends AppError {
  constructor(recurso, id) {
    super(404, 'NO_ENCONTRADO', `${recurso} con id ${id} no existe`);
  }
}

class ConflictError extends AppError {
  constructor(code, message, details) {
    super(409, code, message, details);
  }
}

class BusinessRuleError extends AppError {
  constructor(code, message, details) {
    super(422, code, message, details);
  }
}

/** Convierte un resultado { ok, value, errors } en un valor o lanza ValidationError. */
const exigir = (resultado) => {
  if (!resultado.ok) throw new ValidationError(resultado.errors);
  return resultado.value;
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  exigir,
};

