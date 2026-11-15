import { DatabaseSync } from 'node:sqlite';
import { getDb } from '../database/connection';

export interface AuditLogInput {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  details?: string | Record<string, unknown>;
  ipAddress?: string | null;
  createdAt?: string;
}

export function recordAuditLog(input: AuditLogInput, txDb?: DatabaseSync): void {
  const db = txDb || getDb();
  const detailsStr =
    typeof input.details === 'object' && input.details !== null
      ? JSON.stringify(input.details)
      : input.details || null;
  const now = input.createdAt || new Date().toISOString();

  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.userId ?? null,
    input.action,
    input.entity,
    input.entityId ?? null,
    detailsStr,
    input.ipAddress ?? null,
    now
  );
}
