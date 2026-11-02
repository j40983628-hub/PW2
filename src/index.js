'use strict';

const config = require('./config');
const { crearPool, crearMariaDbStore } = require('./repositories/mariadb');
const { crearServidor } = require('./servidor');

const iniciar = async () => {
  const store = crearMariaDbStore(crearPool(config.db));
  await store.ping(); // falla rápido si MariaDB no está disponible

  const { servidor, io } = crearServidor({ store, corsOrigin: config.corsOrigin });
  servidor.listen(config.puerto, () => {
    console.log(`API de reservas escuchando en http://localhost:${config.puerto}`);
    console.log(`Panel de eventos en tiempo real: http://localhost:${config.puerto}/`);
  });

  const apagar = async (senal) => {
    console.log(`\n${senal} recibido, cerrando...`);
    io.close();
    servidor.close(async () => {
      await store.cerrar();
      process.exit(0);
    });
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
};

iniciar().catch((error) => {
  console.error('No se pudo iniciar la API:', error.message);
  process.exit(1);
});

