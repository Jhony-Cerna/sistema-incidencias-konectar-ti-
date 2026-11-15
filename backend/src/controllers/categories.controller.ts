import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDb, normalizeRow, normalizeRows } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { recordAuditLog } from '../services/audit.service';

const updateCategorySchema = z.object({
  description: z.string().trim().min(5).max(300),
  slaResponseMinutes: z.coerce.number().int().min(1).max(1440),
  slaResolutionMinutes: z.coerce.number().int().min(5).max(10080),
});

export function listCategories(_req: Request, res: Response, next: NextFunction): void {
  try {
    const db = getDb();
    const categories = normalizeRows(
      db
        .prepare(
          `SELECT
             c.id, c.code, c.name, c.description,
             c.sla_response_minutes AS slaResponseMinutes,
             c.sla_resolution_minutes AS slaResolutionMinutes,
             c.is_active AS isActive,
             COUNT(tk.id) AS totalTickets
           FROM categories c
           LEFT JOIN tickets tk ON tk.category_id = c.id
           WHERE c.is_active = 1
           GROUP BY c.id
           ORDER BY c.id ASC`
        )
        .all()
    );

    res.json({
      success: true,
      data: categories.map((c) => ({
        ...c,
        id: Number(c.id),
        slaResponseMinutes: Number(c.slaResponseMinutes),
        slaResolutionMinutes: Number(c.slaResolutionMinutes),
        isActive: Boolean(c.isActive),
        totalTickets: Number(c.totalTickets || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export function updateCategory(req: Request, res: Response, next: NextFunction): void {
  try {
    const categoryId = Number(req.params.id);
    const { description, slaResponseMinutes, slaResolutionMinutes } = updateCategorySchema.parse(req.body);
    const db = getDb();

    const exists = normalizeRow(db.prepare('SELECT id, name FROM categories WHERE id = ?').get(categoryId));
    if (!exists) {
      throw new AppError('Categoría no encontrada.', 404);
    }

    db.prepare(
      `UPDATE categories
       SET description = ?, sla_response_minutes = ?, sla_resolution_minutes = ?
       WHERE id = ?`
    ).run(description, slaResponseMinutes, slaResolutionMinutes, categoryId);

    recordAuditLog({
      userId: req.user?.id,
      action: 'UPDATE_CATEGORY_SLA',
      entity: 'categories',
      entityId: categoryId,
      details: { slaResponseMinutes, slaResolutionMinutes },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Parámetros de la categoría actualizados correctamente.',
    });
  } catch (error) {
    next(error);
  }
}
