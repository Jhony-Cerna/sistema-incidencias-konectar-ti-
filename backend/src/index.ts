import app from './app';
import { env } from './config/env';
import { closeDb, getDb } from './database/connection';
import { seedDatabase } from './database/seed';

// Asegurar esquema relacional y datos corporativos iniciales si la base de datos está vacía
getDb();
seedDatabase(false);

const server = app.listen(env.port, () => {
  console.log('==================================================================');
  console.log(' KONECTAR BPO S.A.C. - Sistema de Gestión de Incidencias Soporte TI');
  console.log(` Servidor API REST activo en: http://localhost:${env.port}/api/health`);
  console.log(` Base de datos relacional:    ${env.dbPath}`);
  console.log('==================================================================');
});

function shutdown() {
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
