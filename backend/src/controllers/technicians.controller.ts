import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDb, normalizeRow } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { getAutoAssignmentSettings, getTechniciansWithWorkload } from '../services/assignment.service';
import { recordAuditLog } from '../services/audit.service';

const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
  maxConcurrentTickets: z.coerce.number().int().min(1).max(50).optional(),
});

export function listTechnicians(_req: Request, res: Response, next: NextFunction): void {
  try {
    const technicians = getTechniciansWithWorkload();
    const autoAssign = getAutoAssignmentSettings();
    res.json({
      success: true,
      data: {
        technicians,
        autoAssignment: autoAssign,
      },
    });
  } catch (error) {
    next(error);
  }
}

export function updateTechnicianAvailability(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const techId = Number(req.params.id);
    const { isAvailable, maxConcurrentTickets } = updateAvailabilitySchema.parse(req.body);

    const db = getDb();
    const techRow = normalizeRow<{ id: number; user_id: number }>(
      db.prepare('SELECT id, user_id FROM technicians WHERE id = ?').get(techId)
    );
    if (!techRow) {
      throw new AppError('Técnico no encontrado.', 404);
    }

    // Solo ADMIN o el propio técnico pueden cambiar su estado de disponibilidad
    if (req.user.role !== 'ADMIN' && Number(techRow.user_id) !== req.user.id) {
      throw new AppError('No tiene permiso para modificar la disponibilidad de otro técnico.', 403, 'FORBIDDEN');
    }

    const now = new Date().toISOString();
    if (maxConcurrentTickets !== undefined && req.user.role === 'ADMIN') {
      db.prepare('UPDATE technicians SET is_available = ?, max_concurrent_tickets = ?, updated_at = ? WHERE id = ?').run(
        isAvailable ? 1 : 0,
        maxConcurrentTickets,
        now,
        techId
      );
    } else {
      db.prepare('UPDATE technicians SET is_available = ?, updated_at = ? WHERE id = ?').run(
        isAvailable ? 1 : 0,
        now,
        techId
      );
    }

    recordAuditLog({
      userId: req.user.id,
      action: 'UPDATE_TECHNICIAN_AVAILABILITY',
      entity: 'technicians',
      entityId: techId,
      details: { isAvailable, maxConcurrentTickets },
      ipAddress: req.ip,
      createdAt: now,
    });

    res.json({
      success: true,
      message: `Disponibilidad del técnico actualizada (${isAvailable ? 'Disponible' : 'No disponible'}).`,
    });
  } catch (error) {
    next(error);
  }
}
