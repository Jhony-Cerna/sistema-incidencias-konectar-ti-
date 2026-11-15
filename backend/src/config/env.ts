import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isVercel = Boolean(process.env.VERCEL);

export const env = {
  nodeEnv: process.env.NODE_ENV || (isVercel ? 'production' : 'development'),
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'konectar_bpo_itsm_sede_lima_norte_jwt_secret_2026_secure',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbPath: process.env.DB_PATH
    ? path.resolve(__dirname, '../..', process.env.DB_PATH)
    : isVercel
    ? path.join(os.tmpdir(), 'konectar_itsm.sqlite')
    : path.resolve(__dirname, '../../data/konectar_itsm.sqlite'),
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(__dirname, '../..', process.env.UPLOAD_DIR)
    : isVercel
    ? path.join(os.tmpdir(), 'uploads')
    : path.resolve(__dirname, '../../uploads'),
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 5),
  corsOrigin: process.env.CORS_ORIGIN || (isVercel ? '*' : 'http://localhost:5173'),
};
