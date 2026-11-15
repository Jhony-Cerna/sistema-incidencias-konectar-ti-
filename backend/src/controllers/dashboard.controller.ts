import { SQLInputValue } from 'node:sqlite';
import { Request, Response, NextFunction } from 'express';
import { getDb, normalizeRow, normalizeRows } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { getTechniciansWithWorkload } from '../services/assignment.service';

export function getDashboardStats(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const db = getDb();
    const role = req.user.role;

    let scopeWhere = '';
    const scopeParams: SQLInputValue[] = [];

    if (role === 'COLABORADOR') {
      scopeWhere = 'WHERE tk.reporter_id = ?';
      scopeParams.push(req.user.id);
    } else if (role === 'TECNICO') {
      scopeWhere = 'WHERE tk.assigned_technician_id = ?';
      scopeParams.push(req.user.technicianId || -1);
    }

    const summaryRow = normalizeRow(
      db
        .prepare(
          `SELECT
             COUNT(*) AS total_tickets,
             SUM(CASE WHEN tk.status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending_tickets,
             SUM(CASE WHEN tk.status = 'EN_PROCESO' THEN 1 ELSE 0 END) AS in_progress_tickets,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved_tickets,
             SUM(CASE WHEN tk.assigned_technician_id IS NULL AND tk.status != 'RESUELTO' THEN 1 ELSE 0 END) AS unassigned_tickets,
             SUM(CASE WHEN tk.priority = 'CRITICA' AND tk.status != 'RESUELTO' THEN 1 ELSE 0 END) AS active_critical_tickets,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               1
             ) AS avg_first_response_minutes,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.resolved_at IS NOT NULL
                   THEN (julianday(tk.resolved_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               1
             ) AS avg_resolution_minutes
           FROM tickets tk
           ${scopeWhere}`
        )
        .get(...scopeParams)
    );

    const totalTickets = Number(summaryRow?.total_tickets || 0);
    const pendingTickets = Number(summaryRow?.pending_tickets || 0);
    const inProgressTickets = Number(summaryRow?.in_progress_tickets || 0);
    const resolvedTickets = Number(summaryRow?.resolved_tickets || 0);
    const unassignedTickets = Number(summaryRow?.unassigned_tickets || 0);
    const activeCriticalTickets = Number(summaryRow?.active_critical_tickets || 0);
    const avgFirstResponseMinutes =
      summaryRow?.avg_first_response_minutes !== null && summaryRow?.avg_first_response_minutes !== undefined
        ? Number(summaryRow.avg_first_response_minutes)
        : 0;
    const avgResolutionMinutes =
      summaryRow?.avg_resolution_minutes !== null && summaryRow?.avg_resolution_minutes !== undefined
        ? Number(summaryRow.avg_resolution_minutes)
        : 0;

    // KPI 2: Porcentaje de solicitudes atendidas exitosamente (Tasa de resolución)
    const resolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 1000) / 10 : 0;

    // Distribución por Categoría
    const byCategory = normalizeRows(
      db
        .prepare(
          `SELECT
             c.id, c.code, c.name,
             COUNT(tk.id) AS total,
             SUM(CASE WHEN tk.status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN tk.status = 'EN_PROCESO' THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved
           FROM categories c
           LEFT JOIN tickets tk ON tk.category_id = c.id
             ${role === 'COLABORADOR' ? 'AND tk.reporter_id = ?' : role === 'TECNICO' ? 'AND tk.assigned_technician_id = ?' : ''}
           WHERE c.is_active = 1
           GROUP BY c.id
           ORDER BY c.id ASC`
        )
        .all(...scopeParams)
    ).map((c) => ({
      id: Number(c.id),
      code: String(c.code),
      name: String(c.name),
      total: Number(c.total || 0),
      pending: Number(c.pending || 0),
      inProgress: Number(c.in_progress || 0),
      resolved: Number(c.resolved || 0),
    }));

    // Distribución por Prioridad
    const byPriority = normalizeRows(
      db
        .prepare(
          `SELECT
             tk.priority,
             COUNT(*) AS total
           FROM tickets tk
           ${scopeWhere}
           GROUP BY tk.priority`
        )
        .all(...scopeParams)
    ).map((p) => ({
      priority: String(p.priority),
      total: Number(p.total || 0),
    }));

    // Evolución de incidencias por período (últimos 14 días con actividad o calendario reciente)
    const trendRows = normalizeRows(
      db
        .prepare(
          `SELECT
             date(tk.created_at) AS day,
             COUNT(*) AS registered,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved
           FROM tickets tk
           ${scopeWhere}
           GROUP BY date(tk.created_at)
           ORDER BY day ASC
           LIMIT 15`
        )
        .all(...scopeParams)
    ).map((t) => ({
      date: String(t.day),
      registered: Number(t.registered || 0),
      resolved: Number(t.resolved || 0),
    }));

    // Incidencias recientes según alcance del rol
    const recentTickets = normalizeRows(
      db
        .prepare(
          `SELECT
             tk.id, tk.code, tk.subject, tk.priority, tk.status, tk.created_at,
             c.name AS category_name, c.code AS category_code,
             rep.full_name AS reporter_name,
             dept.name AS department_name,
             tu.full_name AS technician_name
           FROM tickets tk
           INNER JOIN categories c ON c.id = tk.category_id
           INNER JOIN users rep ON rep.id = tk.reporter_id
           INNER JOIN departments dept ON dept.id = tk.department_id
           LEFT JOIN technicians t ON t.id = tk.assigned_technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           ${scopeWhere}
           ORDER BY tk.created_at DESC
           LIMIT 8`
        )
        .all(...scopeParams)
    ).map((r) => ({
      id: Number(r.id),
      code: String(r.code),
      subject: String(r.subject),
      priority: String(r.priority),
      status: String(r.status),
      createdAt: String(r.created_at),
      categoryName: String(r.category_name),
      categoryCode: String(r.category_code),
      reporterName: String(r.reporter_name),
      departmentName: String(r.department_name),
      technicianName: r.technician_name ? String(r.technician_name) : null,
    }));

    // Carga y rendimiento por técnico (solo ADMIN ve todos; TECNICO ve su propio resumen)
    const techniciansPerformance =
      role === 'ADMIN'
        ? getTechniciansWithWorkload(db)
        : role === 'TECNICO'
        ? getTechniciansWithWorkload(db).filter((t) => t.technicianId === req.user?.technicianId)
        : [];

    res.json({
      success: true,
      data: {
        roleScope: role,
        summary: {
          totalTickets,
          pendingTickets,
          inProgressTickets,
          resolvedTickets,
          unassignedTickets,
          activeCriticalTickets,
          avgFirstResponseMinutes,
          avgResolutionMinutes,
          resolutionRate,
        },
        byCategory,
        byPriority,
        trend: trendRows,
        techniciansPerformance,
        recentTickets,
      },
    });
  } catch (error) {
    next(error);
  }
}
