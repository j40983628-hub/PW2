'use strict';

const { validarSala } = require('../domain/sala');
const { NotFoundError, exigir } = require('../domain/errores');

const crearSalaService = ({ store, notificador }) => {
  const obtener = async (id) => {
    const sala = await store.salas.buscarPorId(id);
    if (!sala) throw new NotFoundError('Sala', id);
    return sala;
  };

  const listar = () => store.salas.listar();

  const crear = async (entrada) => {
    const datos = exigir(validarSala(entrada));
    const sala = await store.salas.insertar(datos);
    notificador.emitir('sala:creada', sala);
    return sala;
  };

  const reemplazar = async (id, entrada) => {
    const datos = exigir(validarSala(entrada));
    const sala = await store.salas.actualizar(id, datos);
    if (!sala) throw new NotFoundError('Sala', id);
    notificador.emitir('sala:actualizada', sala);
    return sala;
  };

  const eliminar = async (id) => {
    const eliminada = await store.salas.eliminar(id);
    if (!eliminada) throw new NotFoundError('Sala', id);
    notificador.emitir('sala:eliminada', { id });
  };

  return Object.freeze({ listar, obtener, crear, reemplazar, eliminar });
};

module.exports = { crearSalaService };

