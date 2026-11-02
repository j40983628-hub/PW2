'use strict';

const { reglas, normalizadores, validar } = require('./validacion');

const esquemaSala = Object.freeze({
  nombre: { requerido: true, regla: reglas.texto({ min: 2, max: 100 }), normalizar: normalizadores.recortar },
  capacidad: { requerido: true, regla: reglas.entero({ min: 1, max: 1000 }) },
  ubicacion: { regla: reglas.texto({ min: 0, max: 150 }), normalizar: normalizadores.recortar, defecto: null },
});

/** POST y PUT usan el esquema completo (PUT = reemplazo total). */
const validarSala = (entrada) => validar(entrada, esquemaSala);

module.exports = { esquemaSala, validarSala };

