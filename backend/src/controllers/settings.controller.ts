import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDb, normalizeRows, withTransaction } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { recordAuditLog } from '../services/audit.service';

const updateSettingsSchema = z.object({
  auto_assign_enabled: z.enum(['true', 'false']),
  auto_assign_strategy: z.enum(['SPECIALTY_AND_WORKLOAD', 'LEAST_WORKLOAD']),
  company_site_name: z.string().trim().min(3).max(120).optional(),
  support_email: z.string().trim().email().optional(),
});

export function getSettings(_req: Request, res: Response, next: NextFunction): void {
  try {
    const db = getDb();
    const settingsRows = normalizeRows(
      db
        .prepare(
          `SELECT s.key, s.value, s.description, s.updated_at, u.full_name AS updated_by_name
           FROM system_settings s
           LEFT JOIN users u ON u.id = s.updated_by_user_id
           ORDER BY s.key ASC`
        )
        .all()
    );

    const auditLogs = normalizeRows(
      db
        .prepare(
          `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip_address, a.created_at,
                  u.full_name AS user_name, u.employee_code
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 50`
        )
        .all()
    );

    const settingsMap: Record<string, string> = {};
    for (const row of settingsRows) {
      settingsMap[String(row.key)] = String(row.value);
    }

    res.json({
      success: true,
      data: {
        settings: settingsMap,
        settingsDetails: settingsRows,
        auditLogs: auditLogs.map((l) => ({
          id: Number(l.id),
          action: String(l.action),
          entity: String(l.entity),
          entityId: l.entity_id ? Number(l.entity_id) : null,
          details: l.details ? String(l.details) : null,
          ipAddress: l.ip_address ? String(l.ip_address) : null,
          createdAt: String(l.created_at),
          userName: l.user_name ? String(l.user_name) : 'Sistema',
          employeeCode: l.employee_code ? String(l.employee_code) : null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

export function updateSettings(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const parsed = updateSettingsSchema.parse(req.body);
    const now = new Date().toISOString();

    withTransaction((db) => {
      const entries = Object.entries(parsed).filter(([, val]) => val !== undefined) as [string, string][];

      for (const [key, value] of entries) {
        db.prepare(
          `INSERT INTO system_settings (key, value, description, updated_by_user_id, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_by_user_id = excluded.updated_by_user_id,
             updated_at = excluded.updated_at`
        ).run(key, value, `Parámetro operativo: ${key}`, currentUser.id, now);
      }

      recordAuditLog(
        {
          userId: currentUser.id,
          action: 'UPDATE_SYSTEM_SETTINGS',
          entity: 'system_settings',
          details: parsed,
          ipAddress: req.ip,
          createdAt: now,
        },
        db
      );
    });

    res.json({
      success: true,
      message: 'Configuración general del sistema guardada correctamente.',
    });
  } catch (error) {
    next(error);
  }
}
