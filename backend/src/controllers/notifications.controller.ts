import { Request, Response, NextFunction } from 'express';
import { getDb, normalizeRow, normalizeRows } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';

export function listNotifications(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const db = getDb();
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(100, Math.max(5, Number(req.query.limit || 40)));

    const unreadCountRow = normalizeRow<{ count: number }>(
      db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id)
    );

    const rows = normalizeRows(
      db
        .prepare(
          `SELECT
             n.id, n.ticket_id, n.event_type, n.title, n.message,
             n.is_read, n.read_at, n.created_at,
             tk.code AS ticket_code, tk.status AS ticket_status
           FROM notifications n
           LEFT JOIN tickets tk ON tk.id = n.ticket_id
           WHERE n.user_id = ? ${unreadOnly ? 'AND n.is_read = 0' : ''}
           ORDER BY n.created_at DESC, n.id DESC
           LIMIT ?`
        )
        .all(req.user.id, limit)
    );

    res.json({
      success: true,
      data: {
        unreadCount: Number(unreadCountRow?.count || 0),
        items: rows.map((n) => ({
          id: Number(n.id),
          ticketId: n.ticket_id ? Number(n.ticket_id) : null,
          ticketCode: n.ticket_code ? String(n.ticket_code) : null,
          ticketStatus: n.ticket_status ? String(n.ticket_status) : null,
          eventType: String(n.event_type),
          title: String(n.title),
          message: String(n.message),
          isRead: Boolean(n.is_read),
          readAt: n.read_at ? String(n.read_at) : null,
          createdAt: String(n.created_at),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

export function markNotificationAsRead(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const notificationId = Number(req.params.id);
    const db = getDb();
    const now = new Date().toISOString();

    const result = db
      .prepare('UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?')
      .run(now, notificationId, req.user.id);

    if (Number(result.changes) === 0) {
      throw new AppError('Notificación no encontrada.', 404);
    }

    res.json({
      success: true,
      message: 'Notificación marcada como leída.',
    });
  } catch (error) {
    next(error);
  }
}

export function markAllNotificationsAsRead(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare('UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0').run(
      now,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Todas las notificaciones fueron marcadas como leídas.',
    });
  } catch (error) {
    next(error);
  }
}
