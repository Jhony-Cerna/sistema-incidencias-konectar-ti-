import { SQLInputValue } from 'node:sqlite';
import { Request, Response, NextFunction } from 'express';
import { getDb, normalizeRow, normalizeRows } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';

function buildReportFilters(req: Request): { whereClause: string; params: SQLInputValue[] } {
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];

  const period = String(req.query.period || '').trim();
  const dateFrom = String(req.query.dateFrom || '').trim();
  const dateTo = String(req.query.dateTo || '').trim();
  const technicianId = req.query.technicianId ? Number(req.query.technicianId) : null;
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const status = String(req.query.status || '').trim();

  // Si es TECNICO y consulta reportes, ve sus métricas o globales según permiso; restringimos filtro si se solicita
  if (req.user?.role === 'TECNICO' && req.query.onlyMine === 'true') {
    conditions.push('tk.assigned_technician_id = ?');
    params.push(req.user.technicianId || -1);
  } else if (technicianId) {
    conditions.push('tk.assigned_technician_id = ?');
    params.push(technicianId);
  }

  if (dateFrom) {
    conditions.push('date(tk.created_at) >= date(?)');
    params.push(dateFrom);
  } else if (period === '7d') {
    conditions.push("date(tk.created_at) >= date('now', '-7 days')");
  } else if (period === '30d') {
    conditions.push("date(tk.created_at) >= date('now', '-30 days')");
  } else if (period === '90d') {
    conditions.push("date(tk.created_at) >= date('now', '-90 days')");
  }

  if (dateTo) {
    conditions.push('date(tk.created_at) <= date(?)');
    params.push(dateTo);
  }

  if (categoryId) {
    conditions.push('tk.category_id = ?');
    params.push(categoryId);
  }

  if (status && ['PENDIENTE', 'EN_PROCESO', 'RESUELTO'].includes(status)) {
    conditions.push('tk.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

/**
 * MÓDULO 7: REPORTES E INDICADORES KPI
 * KPI 1: Tiempo de primera respuesta = Fecha y hora de primera respuesta - Fecha y hora de registro
 * KPI 2: Tasa de resolución = (Incidencias resueltas / Total de incidencias registradas) * 100
 */
export function getKpiReport(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const db = getDb();
    const { whereClause, params } = buildReportFilters(req);

    const kpiRow = normalizeRow(
      db
        .prepare(
          `SELECT
             COUNT(*) AS total_registered,
             SUM(CASE WHEN tk.status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending_count,
             SUM(CASE WHEN tk.status = 'EN_PROCESO' THEN 1 ELSE 0 END) AS in_progress_count,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved_count,
             SUM(CASE WHEN tk.first_response_at IS NOT NULL THEN 1 ELSE 0 END) AS responded_count,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS avg_first_response_minutes,
             ROUND(
               MIN(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS min_first_response_minutes,
             ROUND(
               MAX(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS max_first_response_minutes,
             SUM(
               CASE
                 WHEN tk.first_response_at IS NOT NULL
                  AND ((julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0) <= c.sla_response_minutes
                 THEN 1
                 ELSE 0
               END
             ) AS within_sla_response_count,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.resolved_at IS NOT NULL
                   THEN (julianday(tk.resolved_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS avg_resolution_minutes
           FROM tickets tk
           INNER JOIN categories c ON c.id = tk.category_id
           ${whereClause}`
        )
        .get(...params)
    );

    const totalRegistered = Number(kpiRow?.total_registered || 0);
    const resolvedCount = Number(kpiRow?.resolved_count || 0);
    const pendingCount = Number(kpiRow?.pending_count || 0);
    const inProgressCount = Number(kpiRow?.in_progress_count || 0);
    const respondedCount = Number(kpiRow?.responded_count || 0);
    const withinSlaResponseCount = Number(kpiRow?.within_sla_response_count || 0);

    // Fórmula exacta KPI 2: (Incidencias resueltas / Total de incidencias registradas) * 100
    const resolutionRate =
      totalRegistered > 0 ? Math.round((resolvedCount / totalRegistered) * 10000) / 100 : 0;

    const slaResponseComplianceRate =
      respondedCount > 0 ? Math.round((withinSlaResponseCount / respondedCount) * 10000) / 100 : 0;

    // Desglose por Categoría
    const byCategory = normalizeRows(
      db
        .prepare(
          `SELECT
             c.id, c.code, c.name, c.sla_response_minutes,
             COUNT(tk.id) AS total,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved,
             SUM(CASE WHEN tk.status = 'EN_PROCESO' THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN tk.status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS avg_first_response_minutes
           FROM categories c
           LEFT JOIN (
             SELECT tk.* FROM tickets tk ${whereClause}
           ) tk ON tk.category_id = c.id
           WHERE c.is_active = 1
           GROUP BY c.id
           ORDER BY c.id ASC`
        )
        .all(...params)
    ).map((r) => {
      const total = Number(r.total || 0);
      const resolved = Number(r.resolved || 0);
      return {
        categoryId: Number(r.id),
        code: String(r.code),
        name: String(r.name),
        slaTargetMinutes: Number(r.sla_response_minutes),
        total,
        resolved,
        inProgress: Number(r.in_progress || 0),
        pending: Number(r.pending || 0),
        resolutionRate: total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0,
        avgFirstResponseMinutes:
          r.avg_first_response_minutes !== null && r.avg_first_response_minutes !== undefined
            ? Number(r.avg_first_response_minutes)
            : null,
      };
    });

    // Desglose por Técnico de Soporte TI
    const byTechnician = normalizeRows(
      db
        .prepare(
          `SELECT
             t.id AS technician_id,
             u.full_name AS technician_name,
             t.specialty,
             t.support_level,
             COUNT(tk.id) AS total_assigned,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved,
             SUM(CASE WHEN tk.status = 'EN_PROCESO' THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN tk.status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS avg_first_response_minutes,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.resolved_at IS NOT NULL
                   THEN (julianday(tk.resolved_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS avg_resolution_minutes
           FROM technicians t
           INNER JOIN users u ON u.id = t.user_id
           LEFT JOIN (
             SELECT tk.* FROM tickets tk ${whereClause}
           ) tk ON tk.assigned_technician_id = t.id
           GROUP BY t.id
           ORDER BY resolved DESC, total_assigned DESC`
        )
        .all(...params)
    ).map((r) => {
      const total = Number(r.total_assigned || 0);
      const resolved = Number(r.resolved || 0);
      return {
        technicianId: Number(r.technician_id),
        technicianName: String(r.technician_name),
        specialty: String(r.specialty),
        supportLevel: String(r.support_level),
        totalAssigned: total,
        resolved,
        inProgress: Number(r.in_progress || 0),
        pending: Number(r.pending || 0),
        resolutionRate: total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0,
        avgFirstResponseMinutes:
          r.avg_first_response_minutes !== null && r.avg_first_response_minutes !== undefined
            ? Number(r.avg_first_response_minutes)
            : null,
        avgResolutionMinutes:
          r.avg_resolution_minutes !== null && r.avg_resolution_minutes !== undefined
            ? Number(r.avg_resolution_minutes)
            : null,
      };
    });

    // Desglose por Área / Departamento BPO
    const byDepartment = normalizeRows(
      db
        .prepare(
          `SELECT
             d.name AS department_name,
             COUNT(tk.id) AS total,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved
           FROM tickets tk
           INNER JOIN departments d ON d.id = tk.department_id
           INNER JOIN categories c ON c.id = tk.category_id
           ${whereClause}
           GROUP BY d.id
           ORDER BY total DESC`
        )
        .all(...params)
    ).map((d) => ({
      departmentName: String(d.department_name),
      total: Number(d.total || 0),
      resolved: Number(d.resolved || 0),
    }));

    // Evolución temporal de KPIs
    const timeline = normalizeRows(
      db
        .prepare(
          `SELECT
             date(tk.created_at) AS date,
             COUNT(*) AS total_registered,
             SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved_count,
             ROUND(
               AVG(
                 CASE
                   WHEN tk.first_response_at IS NOT NULL
                   THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                   ELSE NULL
                 END
               ),
               2
             ) AS avg_first_response_minutes
           FROM tickets tk
           INNER JOIN categories c ON c.id = tk.category_id
           ${whereClause}
           GROUP BY date(tk.created_at)
           ORDER BY date ASC`
        )
        .all(...params)
    ).map((t) => {
      const reg = Number(t.total_registered || 0);
      const resCount = Number(t.resolved_count || 0);
      return {
        date: String(t.date),
        totalRegistered: reg,
        resolvedCount: resCount,
        resolutionRate: reg > 0 ? Math.round((resCount / reg) * 1000) / 10 : 0,
        avgFirstResponseMinutes:
          t.avg_first_response_minutes !== null && t.avg_first_response_minutes !== undefined
            ? Number(t.avg_first_response_minutes)
            : 0,
      };
    });

    // Detalle auditable de tickets evaluados en el reporte
    const detailedTickets = normalizeRows(
      db
        .prepare(
          `SELECT
             tk.id, tk.code, tk.subject, tk.priority, tk.status,
             tk.created_at, tk.first_response_at, tk.resolved_at,
             c.name AS category_name,
             d.name AS department_name,
             rep.full_name AS reporter_name,
             tu.full_name AS technician_name,
             ROUND(
               CASE
                 WHEN tk.first_response_at IS NOT NULL
                 THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                 ELSE NULL
               END,
               2
             ) AS first_response_minutes,
             ROUND(
               CASE
                 WHEN tk.resolved_at IS NOT NULL
                 THEN (julianday(tk.resolved_at) - julianday(tk.created_at)) * 1440.0
                 ELSE NULL
               END,
               2
             ) AS resolution_minutes
           FROM tickets tk
           INNER JOIN categories c ON c.id = tk.category_id
           INNER JOIN departments d ON d.id = tk.department_id
           INNER JOIN users rep ON rep.id = tk.reporter_id
           LEFT JOIN technicians t ON t.id = tk.assigned_technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           ${whereClause}
           ORDER BY tk.created_at DESC
           LIMIT 100`
        )
        .all(...params)
    ).map((r) => ({
      id: Number(r.id),
      code: String(r.code),
      subject: String(r.subject),
      priority: String(r.priority),
      status: String(r.status),
      categoryName: String(r.category_name),
      departmentName: String(r.department_name),
      reporterName: String(r.reporter_name),
      technicianName: r.technician_name ? String(r.technician_name) : 'Sin asignar',
      createdAt: String(r.created_at),
      firstResponseAt: r.first_response_at ? String(r.first_response_at) : null,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      firstResponseMinutes:
        r.first_response_minutes !== null && r.first_response_minutes !== undefined
          ? Number(r.first_response_minutes)
          : null,
      resolutionMinutes:
        r.resolution_minutes !== null && r.resolution_minutes !== undefined
          ? Number(r.resolution_minutes)
          : null,
    }));

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        kpis: {
          totalRegistered,
          pendingCount,
          inProgressCount,
          resolvedCount,
          respondedCount,
          // KPI 1: Tiempo de primera respuesta (en minutos)
          avgFirstResponseMinutes:
            kpiRow?.avg_first_response_minutes !== null && kpiRow?.avg_first_response_minutes !== undefined
              ? Number(kpiRow.avg_first_response_minutes)
              : 0,
          minFirstResponseMinutes:
            kpiRow?.min_first_response_minutes !== null && kpiRow?.min_first_response_minutes !== undefined
              ? Number(kpiRow.min_first_response_minutes)
              : 0,
          maxFirstResponseMinutes:
            kpiRow?.max_first_response_minutes !== null && kpiRow?.max_first_response_minutes !== undefined
              ? Number(kpiRow.max_first_response_minutes)
              : 0,
          slaResponseComplianceRate,
          // KPI 2: Tasa de resolución (%)
          resolutionRate,
          avgResolutionMinutes:
            kpiRow?.avg_resolution_minutes !== null && kpiRow?.avg_resolution_minutes !== undefined
              ? Number(kpiRow.avg_resolution_minutes)
              : 0,
        },
        byCategory,
        byTechnician,
        byDepartment,
        timeline,
        detailedTickets,
      },
    });
  } catch (error) {
    next(error);
  }
}

export function exportKpiReportCsv(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const db = getDb();
    const { whereClause, params } = buildReportFilters(req);

    const rows = normalizeRows(
      db
        .prepare(
          `SELECT
             tk.code, tk.subject, c.name AS category_name, tk.incident_type,
             tk.priority, tk.status, d.name AS department_name,
             rep.full_name AS reporter_name,
             COALESCE(tu.full_name, 'Sin asignar') AS technician_name,
             tk.created_at,
             COALESCE(tk.first_response_at, '') AS first_response_at,
             COALESCE(tk.resolved_at, '') AS resolved_at,
             ROUND(
               CASE
                 WHEN tk.first_response_at IS NOT NULL
                 THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                 ELSE NULL
               END,
               2
             ) AS first_response_minutes,
             ROUND(
               CASE
                 WHEN tk.resolved_at IS NOT NULL
                 THEN (julianday(tk.resolved_at) - julianday(tk.created_at)) * 1440.0
                 ELSE NULL
               END,
               2
             ) AS resolution_minutes
           FROM tickets tk
           INNER JOIN categories c ON c.id = tk.category_id
           INNER JOIN departments d ON d.id = tk.department_id
           INNER JOIN users rep ON rep.id = tk.reporter_id
           LEFT JOIN technicians t ON t.id = tk.assigned_technician_id
           LEFT JOIN users tu ON tu.id = t.user_id
           ${whereClause}
           ORDER BY tk.created_at DESC`
        )
        .all(...params)
    );

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'Código Ticket',
      'Asunto',
      'Categoría',
      'Tipo Incidencia',
      'Prioridad',
      'Estado',
      'Área / Departamento',
      'Colaborador Reportante',
      'Técnico Asignado',
      'Fecha Registro (ISO)',
      'Fecha Primera Respuesta (ISO)',
      'Fecha Resolución (ISO)',
      'KPI 1: Tiempo Primera Respuesta (Minutos)',
      'Tiempo Total Resolución (Minutos)',
    ];

    const lines = [headers.map(escapeCsv).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.code,
          r.subject,
          r.category_name,
          r.incident_type,
          r.priority,
          r.status,
          r.department_name,
          r.reporter_name,
          r.technician_name,
          r.created_at,
          r.first_response_at,
          r.resolved_at,
          r.first_response_minutes ?? '',
          r.resolution_minutes ?? '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    // Incluir BOM UTF-8 para compatibilidad directa con Microsoft Excel en español
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const fileName = `Reporte_KPI_SoporteTI_KONECTAR_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
}
