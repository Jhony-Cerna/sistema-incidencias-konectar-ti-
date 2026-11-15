import { DatabaseSync } from 'node:sqlite';
import { getDb, normalizeRows } from '../database/connection';

export type NotificationEventType =
  | 'NUEVA_INCIDENCIA'
  | 'TICKET_ASIGNADO'
  | 'INCIDENCIA_INICIADA'
  | 'CAMBIO_ESTADO'
  | 'NUEVO_COMENTARIO'
  | 'INCIDENCIA_RESUELTA';

export interface CreateNotificationInput {
  userId: number;
  ticketId?: number | null;
  eventType: NotificationEventType;
  title: string;
  message: string;
  createdAt?: string;
}

export function createNotification(input: CreateNotificationInput, txDb?: DatabaseSync): void {
  const db = txDb || getDb();
  const now = input.createdAt || new Date().toISOString();

  db.prepare(
    `INSERT INTO notifications (user_id, ticket_id, event_type, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(input.userId, input.ticketId ?? null, input.eventType, input.title, input.message, now);
}

/**
 * Envía una notificación a todos los usuarios activos con rol ADMIN,
 * excluyendo opcionalmente al usuario que ejecutó la acción para evitar duplicados.
 */
export function notifyActiveAdmins(
  params: {
    excludeUserId?: number | null;
    ticketId?: number | null;
    eventType: NotificationEventType;
    title: string;
    message: string;
    createdAt?: string;
  },
  txDb?: DatabaseSync
): void {
  const db = txDb || getDb();
  const admins = normalizeRows<{ id: number }>(
    db
      .prepare(
        `SELECT u.id
         FROM users u
         INNER JOIN roles r ON r.id = u.role_id
         WHERE r.code = 'ADMIN' AND u.is_active = 1`
      )
      .all()
  );

  for (const admin of admins) {
    if (params.excludeUserId && Number(admin.id) === Number(params.excludeUserId)) {
      continue;
    }
    createNotification(
      {
        userId: Number(admin.id),
        ticketId: params.ticketId ?? null,
        eventType: params.eventType,
        title: params.title,
        message: params.message,
        createdAt: params.createdAt,
      },
      db
    );
  }
}
