import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from './error.middleware';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.log',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

if (!fs.existsSync(env.uploadDir)) {
  fs.mkdirSync(env.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.bin';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    cb(null, uniqueName);
  },
});

export const uploadAttachments = multer({
  storage,
  limits: {
    fileSize: env.maxFileSizeMb * 1024 * 1024,
    files: 4,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || (!ALLOWED_MIME_TYPES.has(file.mimetype) && ext !== '.log')) {
      cb(
        new AppError(
          `Formato de archivo no permitido (${file.originalname}). Formatos aceptados: imágenes (JPG, PNG, WEBP), PDF, TXT/LOG, Word y Excel.`,
          400,
          'INVALID_FILE_TYPE'
        )
      );
      return;
    }
    cb(null, true);
  },
});
