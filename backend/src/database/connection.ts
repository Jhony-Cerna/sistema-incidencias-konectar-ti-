import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env';

let dbInstance: DatabaseSync | null = null;

/**
 * Convierte objetos de fila con prototipo nulo (retornados por node:sqlite)
 * en objetos planos serializables estándar de JavaScript.
 */
export function normalizeRow<T = Record<string, any>>(row: Record<string, any> | undefined): T | undefined {
  if (!row) return undefined;
  return { ...row } as T;
}

export function normalizeRows<T = Record<string, any>>(rows: Record<string, any>[]): T[] {
  return rows.map((r) => ({ ...r } as T));
}

/**
 * Inicializa y retorna la conexión singleton a la base de datos relacional SQLite
 * con integridad referencial activa, modo WAL para concurrencia y timeout de bloqueo.
 */
export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(env.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }

  dbInstance = new DatabaseSync(env.dbPath, {
    enableForeignKeyConstraints: true,
  });

  // Configuración RDBMS empresarial: Integridad referencial + concurrencia WAL + espera de bloqueo
  dbInstance.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);

  const localSchemaPath = path.resolve(__dirname, 'schema.sql');
  const srcSchemaPath = path.resolve(__dirname, '../../src/database/schema.sql');
  const schemaPath = fs.existsSync(localSchemaPath) ? localSchemaPath : srcSchemaPath;
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  dbInstance.exec(schemaSql);

  return dbInstance;
}

/**
 * Ejecuta un bloque de operaciones dentro de una transacción ACID serializada
 * (BEGIN IMMEDIATE evita condiciones de carrera en escrituras concurrentes).
 */
export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignorar si ya fue revertida por el motor
    }
    throw error;
  }
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
