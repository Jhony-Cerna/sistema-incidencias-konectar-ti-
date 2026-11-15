import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { seedDatabase } from './database/seed';
import { errorHandler } from './middlewares/error.middleware';
import apiRouter from './routes';

const app = express();

let dbInitialized = false;
function ensureDatabaseSeeded(): void {
  if (!dbInitialized) {
    seedDatabase(false);
    dbInitialized = true;
  }
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : [env.corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Inicializar esquema y datos corporativos si aún no existen (soporte Serverless / Vercel)
app.use('/api', (_req, _res, next) => {
  try {
    ensureDatabaseSeeded();
    next();
  } catch (err) {
    next(err);
  }
});

// Rutas principales de la API REST
app.use('/api', apiRouter);

// Endpoint API no encontrado
app.use('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    code: 'ROUTE_NOT_FOUND',
    message: 'El endpoint solicitado no existe en la API.',
  });
});

// En modo producción (o cuando existe build compilado del frontend), servir la SPA unificada
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Manejador centralizado de errores y validaciones
app.use(errorHandler);

export default app;
