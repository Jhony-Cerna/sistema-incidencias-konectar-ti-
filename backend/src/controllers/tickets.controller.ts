import fs from 'node:fs';
import path from 'node:path';
import { SQLInputValue } from 'node:sqlite';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { getDb, normalizeRow, normalizeRows, withTransaction } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { getAutoAssignmentSettings, selectOptimalTechnician } from '../services/assignment.service';
import { recordAuditLog } from '../services/audit.service';
import { createNotification, notifyActiveAdmins } from '../services/notification.service';
import { generateNextTicketCode } from '../utils/ticketCode';

const createTicketSchema = z.object({
  subject: z.string().trim().min(5, 'El asunto debe tener al menos 5 caracteres.').max(180),
  description: z.string().trim().min(10, 'Describa detalladamente la incidencia (mínimo 10 caracteres).').max(4000),
  categoryId: z.coerce.number().int().positive('Seleccione una categoría válida.'),
  incidentType: z.string().trim().min(3, 'Seleccione el tipo de incidencia.').max(100),
  priority: z.enum(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']),
  workstationCode: z.string().trim().max(50).optional().nullable(),
  departmentId: z.coerce.number().int().positive().optional(),
  reporterId: z.coerce.number().int().positive().optional(),
  assignedTechnicianId: z.coerce.number().int().positive().optional().nullable(),
});

const assignTicketSchema = z.object({
  technicianId: z.coerce.number().int().positive('Seleccione un técnico válido.'),
  reason: z.string().trim().max(500).optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDIENTE', 'EN_PROCESO', 'RESUELTO']),
  comment: z.string().trim().min(4, 'Ingrese un comentario u observación del cambio de estado.').max(1500),
  diagnosis: z.string().trim().max(3000).optional().nullable(),
  solution: z.string().trim().max(3000).optional().nullable(),
});

const updateTechnicalNotesSchema = z.object({
  diagnosis: z.string().trim().max(3000).optional().nullable(),
  solution: z.string().trim().max(3000).optional().nullable(),
});

const addCommentSchema = z.object({
  content: z.string().trim().min(2, 'El comentario no puede estar vacío.').max(2000),
  isInternal: z.boolean().optional().default(false),
});

function diffMinutes(startIso: string, endIso: string): number {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round((diffMs / 60000) * 10) / 10);
}

export function listTickets(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const db = getDb();

    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const priority = String(req.query.priority || '').trim();
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
    const technicianId = req.query.technicianId ? Number(req.query.technicianId) : null;
    const unassignedOnly = req.query.unassignedOnly === 'true';
    const scope = String(req.query.scope || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 25)));

    const conditions: string[] = [];
    const params: SQLInputValue[] = [];

    // Control estricto de visibilidad por Rol
    if (req.user.role === 'COLABORADOR') {
      conditions.push('tk.reporter_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'TECNICO') {
      if (scope === 'knowledge') {
        // Permite al técnico consultar el historial consolidado de fallas resueltas (base de conocimiento)
        conditions.push("tk.status = 'RESUELTO'");
      } else {
        conditions.push('tk.assigned_technician_id = ?');
        params.push(req.user.technicianId || -1);
      }
    }

    if (search) {
      conditions.push(
        '(tk.code LIKE ? OR tk.subject LIKE ? OR rep.full_name LIKE ? OR tk.workstation_code LIKE ?)'
      );
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (status && ['PENDIENTE', 'EN_PROCESO', 'RESUELTO'].includes(status)) {
      conditions.push('tk.status = ?');
      params.push(status);
    }

    if (priority && ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(priority)) {
      conditions.push('tk.priority = ?');
      params.push(priority);
    }

    if (categoryId) {
      conditions.push('tk.category_id = ?');
      params.push(categoryId);
    }

    if (unassignedOnly && req.user.role === 'ADMIN') {
      conditions.push('tk.assigned_technician_id IS NULL');
    } else if (technicianId && req.user.role === 'ADMIN') {
      conditions.push('tk.assigned_technician_id = ?');
      params.push(technicianId);
    }

    if (dateFrom) {
      conditions.push('date(tk.created_at) >= date(?)');
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push('date(tk.created_at) <= date(?)');
      params.push(dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = normalizeRow<{ total: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM tickets tk
           INNER JOIN users rep ON rep.id = tk.reporter_id
           ${whereClause}`
        )
        .get(...params)
    );

    const total = Number(countRow?.total || 0);
    const offset = (page - 1) * pageSize;

    const rows = normalizeRows(
      db
        .prepare(
          `SELECT
             tk.id, tk.code, tk.subject, tk.description, tk.incident_type,
             tk.priority, tk.workstation_code, tk.status,
             tk.first_response_at, tk.resolved_at, tk.created_at, tk.updated_at,
             tk.reporter_id, rep.full_name AS reporter_name, rep.employee_code AS reporter_code,
             tk.department_id, dept.name AS department_name,
             tk.category_id, cat.code AS category_code, cat.name AS category_name,
             cat.sla_response_minutes, cat.sla_resolution_minutes,
             tk.assigned_technician_id,
             tech_user.full_name AS technician_name,
             tech.specialty AS technician_specialty,
             tech.support_level AS technician_level,
             (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = tk.id ${
               req.user.role === 'COLABORADOR' ? 'AND tc.is_internal = 0' : ''
             }) AS comments_count,
             (SELECT COUNT(*) FROM ticket_attachments ta WHERE ta.ticket_id = tk.id) AS attachments_count
           FROM tickets tk
           INNER JOIN users rep ON rep.id = tk.reporter_id
           INNER JOIN departments dept ON dept.id = tk.department_id
           INNER JOIN categories cat ON cat.id = tk.category_id
           LEFT JOIN technicians tech ON tech.id = tk.assigned_technician_id
           LEFT JOIN users tech_user ON tech_user.id = tech.user_id
           ${whereClause}
           ORDER BY
             CASE tk.status
               WHEN 'PENDIENTE' THEN 1
               WHEN 'EN_PROCESO' THEN 2
               ELSE 3
             END ASC,
             CASE tk.priority
               WHEN 'CRITICA' THEN 1
               WHEN 'ALTA' THEN 2
               WHEN 'MEDIA' THEN 3
               ELSE 4
             END ASC,
             tk.created_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset)
    );

    const nowIso = new Date().toISOString();
    const items = rows.map((r) => {
      const createdAt = String(r.created_at);
      const firstResponseAt = r.first_response_at ? String(r.first_response_at) : null;
      const resolvedAt = r.resolved_at ? String(r.resolved_at) : null;

      return {
        id: Number(r.id),
        code: String(r.code),
        subject: String(r.subject),
        description: String(r.description),
        incidentType: String(r.incident_type),
        priority: String(r.priority),
        workstationCode: r.workstation_code ? String(r.workstation_code) : null,
        status: String(r.status),
        createdAt,
        updatedAt: String(r.updated_at),
        firstResponseAt,
        resolvedAt,
        firstResponseMinutes: firstResponseAt ? diffMinutes(createdAt, firstResponseAt) : null,
        resolutionMinutes: resolvedAt ? diffMinutes(createdAt, resolvedAt) : null,
        elapsedMinutes: diffMinutes(createdAt, resolvedAt || nowIso),
        reporter: {
          id: Number(r.reporter_id),
          fullName: String(r.reporter_name),
          employeeCode: String(r.reporter_code),
        },
        department: {
          id: Number(r.department_id),
          name: String(r.department_name),
        },
        category: {
          id: Number(r.category_id),
          code: String(r.category_code),
          name: String(r.category_name),
          slaResponseMinutes: Number(r.sla_response_minutes),
          slaResolutionMinutes: Number(r.sla_resolution_minutes),
        },
        assignedTechnician: r.assigned_technician_id
          ? {
              id: Number(r.assigned_technician_id),
              fullName: String(r.technician_name),
              specialty: String(r.technician_specialty),
              supportLevel: String(r.technician_level),
            }
          : null,
        commentsCount: Number(r.comments_count || 0),
        attachmentsCount: Number(r.attachments_count || 0),
      };
    });

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export function getTicketById(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new AppError('Identificador de ticket inválido.', 400);
    }

    const db = getDb();
    const r = normalizeRow(
      db
        .prepare(
          `SELECT
             tk.*,
             rep.full_name AS reporter_name, rep.email AS reporter_email,
             rep.phone AS reporter_phone, rep.employee_code AS reporter_code,
             dept.name AS department_name, dept.site AS department_site,
             cat.code AS category_code, cat.name AS category_name,
             cat.sla_response_minutes, cat.sla_resolution_minutes,
             tech.user_id AS technician_user_id, tech.specialty AS technician_specialty,
             tech.support_level AS technician_level,
             tech_user.full_name AS technician_name, tech_user.email AS technician_email
           FROM tickets tk
           INNER JOIN users rep ON rep.id = tk.reporter_id
           INNER JOIN departments dept ON dept.id = tk.department_id
           INNER JOIN categories cat ON cat.id = tk.category_id
           LEFT JOIN technicians tech ON tech.id = tk.assigned_technician_id
           LEFT JOIN users tech_user ON tech_user.id = tech.user_id
           WHERE tk.id = ?`
        )
        .get(ticketId)
    );

    if (!r) {
      throw new AppError('La incidencia solicitada no existe.', 404, 'TICKET_NOT_FOUND');
    }

    // Verificación estricta de autorización (Sección 7 Seguridad)
    if (req.user.role === 'COLABORADOR' && Number(r.reporter_id) !== req.user.id) {
      throw new AppError(
        'Acceso denegado: un colaborador solo puede visualizar sus propias incidencias.',
        403,
        'FORBIDDEN'
      );
    }

    if (
      req.user.role === 'TECNICO' &&
      Number(r.assigned_technician_id) !== Number(req.user.technicianId) &&
      String(r.status) !== 'RESUELTO'
    ) {
      throw new AppError(
        'Acceso denegado: este ticket activo se encuentra asignado a otro especialista.',
        403,
        'FORBIDDEN'
      );
    }

    const statusHistory = normalizeRows(
      db
        .prepare(
          `SELECT
             sh.id, sh.previous_status, sh.new_status, sh.comment, sh.created_at,
             u.id AS user_id, u.full_name AS user_name, rl.name AS user_role_name, rl.code AS user_role_code
           FROM ticket_status_history sh
           INNER JOIN users u ON u.id = sh.changed_by_user_id
           INNER JOIN roles rl ON rl.id = u.role_id
           WHERE sh.ticket_id = ?
           ORDER BY sh.created_at ASC, sh.id ASC`
        )
        .all(ticketId)
    ).map((h) => ({
      id: Number(h.id),
      previousStatus: h.previous_status ? String(h.previous_status) : null,
      newStatus: String(h.new_status),
      comment: String(h.comment),
      createdAt: String(h.created_at),
      changedBy: {
        id: Number(h.user_id),
        fullName: String(h.user_name),
        role: String(h.user_role_code),
        roleName: String(h.user_role_name),
      },
    }));

    const assignmentHistory = normalizeRows(
      db
        .prepare(
          `SELECT
             ta.id, ta.assignment_mode, ta.reason, ta.created_at,
             tu.full_name AS technician_name,
             ptu.full_name AS previous_technician_name,
             au.full_name AS assigned_by_name
           FROM ticket_assignments ta
           INNER JOIN technicians t ON t.id = ta.technician_id
           INNER JOIN users tu ON tu.id = t.user_id
           LEFT JOIN technicians pt ON pt.id = ta.previous_technician_id
           LEFT JOIN users ptu ON ptu.id = pt.user_id
           LEFT JOIN users au ON au.id = ta.assigned_by_user_id
           WHERE ta.ticket_id = ?
           ORDER BY ta.created_at ASC, ta.id ASC`
        )
        .all(ticketId)
    ).map((a) => ({
      id: Number(a.id),
      assignmentMode: String(a.assignment_mode),
      reason: a.reason ? String(a.reason) : null,
      createdAt: String(a.created_at),
      technicianName: String(a.technician_name),
      previousTechnicianName: a.previous_technician_name ? String(a.previous_technician_name) : null,
      assignedByName: a.assigned_by_name ? String(a.assigned_by_name) : 'Sistema Automático',
    }));

    const commentsFilter = req.user.role === 'COLABORADOR' ? 'AND tc.is_internal = 0' : '';
    const comments = normalizeRows(
      db
        .prepare(
          `SELECT
             tc.id, tc.content, tc.is_internal, tc.created_at,
             u.id AS user_id, u.full_name AS user_name,
             rl.code AS user_role_code, rl.name AS user_role_name
           FROM ticket_comments tc
           INNER JOIN users u ON u.id = tc.user_id
           INNER JOIN roles rl ON rl.id = u.role_id
           WHERE tc.ticket_id = ? ${commentsFilter}
           ORDER BY tc.created_at ASC, tc.id ASC`
        )
        .all(ticketId)
    ).map((c) => ({
      id: Number(c.id),
      content: String(c.content),
      isInternal: Boolean(c.is_internal),
      createdAt: String(c.created_at),
      author: {
        id: Number(c.user_id),
        fullName: String(c.user_name),
        role: String(c.user_role_code),
        roleName: String(c.user_role_name),
      },
    }));

    const attachments = normalizeRows(
      db
        .prepare(
          `SELECT
             att.id, att.original_name, att.stored_name, att.mime_type, att.size_bytes, att.created_at,
             u.full_name AS uploaded_by_name
           FROM ticket_attachments att
           INNER JOIN users u ON u.id = att.uploaded_by_user_id
           WHERE att.ticket_id = ?
           ORDER BY att.created_at ASC`
        )
        .all(ticketId)
    ).map((att) => ({
      id: Number(att.id),
      originalName: String(att.original_name),
      mimeType: String(att.mime_type),
      sizeBytes: Number(att.size_bytes),
      createdAt: String(att.created_at),
      uploadedByName: String(att.uploaded_by_name),
      downloadUrl: `/api/tickets/${ticketId}/attachments/${att.id}`,
    }));

    const createdAt = String(r.created_at);
    const firstResponseAt = r.first_response_at ? String(r.first_response_at) : null;
    const resolvedAt = r.resolved_at ? String(r.resolved_at) : null;
    const nowIso = new Date().toISOString();

    res.json({
      success: true,
      data: {
        id: Number(r.id),
        code: String(r.code),
        subject: String(r.subject),
        description: String(r.description),
        incidentType: String(r.incident_type),
        priority: String(r.priority),
        workstationCode: r.workstation_code ? String(r.workstation_code) : null,
        status: String(r.status),
        diagnosis: r.diagnosis ? String(r.diagnosis) : null,
        solution: r.solution ? String(r.solution) : null,
        createdAt,
        updatedAt: String(r.updated_at),
        firstResponseAt,
        resolvedAt,
        firstResponseMinutes: firstResponseAt ? diffMinutes(createdAt, firstResponseAt) : null,
        resolutionMinutes: resolvedAt ? diffMinutes(createdAt, resolvedAt) : null,
        elapsedMinutes: diffMinutes(createdAt, resolvedAt || nowIso),
        reporter: {
          id: Number(r.reporter_id),
          fullName: String(r.reporter_name),
          email: String(r.reporter_email),
          phone: r.reporter_phone ? String(r.reporter_phone) : null,
          employeeCode: String(r.reporter_code),
        },
        department: {
          id: Number(r.department_id),
          name: String(r.department_name),
          site: String(r.department_site),
        },
        category: {
          id: Number(r.category_id),
          code: String(r.category_code),
          name: String(r.category_name),
          slaResponseMinutes: Number(r.sla_response_minutes),
          slaResolutionMinutes: Number(r.sla_resolution_minutes),
        },
        assignedTechnician: r.assigned_technician_id
          ? {
              id: Number(r.assigned_technician_id),
              userId: Number(r.technician_user_id),
              fullName: String(r.technician_name),
              email: String(r.technician_email),
              specialty: String(r.technician_specialty),
              supportLevel: String(r.technician_level),
            }
          : null,
        statusHistory,
        assignmentHistory,
        comments,
        attachments,
      },
    });
  } catch (error) {
    next(error);
  }
}

export function createTicket(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const parsed = createTicketSchema.parse(req.body);
    const uploadedFiles = (req.files as Express.Multer.File[] | undefined) || [];
    const now = new Date().toISOString();

    const createdTicket = withTransaction((db) => {
      const category = normalizeRow<{ id: number; code: string; name: string }>(
        db.prepare('SELECT id, code, name FROM categories WHERE id = ? AND is_active = 1').get(parsed.categoryId)
      );
      if (!category) {
        throw new AppError('La categoría seleccionada no existe o está inactiva.', 400, 'INVALID_CATEGORY');
      }

      // Si es ADMIN puede reportar en nombre de otro colaborador; de lo contrario siempre es el propio usuario
      let reporterId = currentUser.id;
      let departmentId = parsed.departmentId || currentUser.departmentId;

      if (currentUser.role === 'ADMIN' && parsed.reporterId) {
        const repRow = normalizeRow<{ id: number; department_id: number }>(
          db.prepare('SELECT id, department_id FROM users WHERE id = ? AND is_active = 1').get(parsed.reporterId)
        );
        if (!repRow) {
          throw new AppError('El usuario reportante seleccionado no es válido.', 400);
        }
        reporterId = Number(repRow.id);
        departmentId = parsed.departmentId || Number(repRow.department_id);
      }

      const ticketCode = generateNextTicketCode(db, now);

      // Evaluar asignación manual (si ADMIN la especificó) o automática configurable
      let assignedTechId: number | null = null;
      let assignedTechUserId: number | null = null;
      let assignedTechName: string | null = null;
      let assignmentMode: 'MANUAL' | 'AUTOMATICA' | null = null;

      if (currentUser.role === 'ADMIN' && parsed.assignedTechnicianId) {
        const techRow = normalizeRow<{ id: number; user_id: number; full_name: string }>(
          db
            .prepare(
              `SELECT t.id, t.user_id, u.full_name
               FROM technicians t
               INNER JOIN users u ON u.id = t.user_id
               WHERE t.id = ? AND u.is_active = 1`
            )
            .get(parsed.assignedTechnicianId)
        );
        if (!techRow) {
          throw new AppError('El técnico seleccionado no existe o está inactivo.', 400);
        }
        assignedTechId = Number(techRow.id);
        assignedTechUserId = Number(techRow.user_id);
        assignedTechName = String(techRow.full_name);
        assignmentMode = 'MANUAL';
      } else {
        const autoSettings = getAutoAssignmentSettings(db);
        if (autoSettings.enabled) {
          const optimal = selectOptimalTechnician(category.code, db, autoSettings.strategy);
          if (optimal) {
            assignedTechId = optimal.technicianId;
            assignedTechUserId = optimal.userId;
            assignedTechName = optimal.fullName;
            assignmentMode = 'AUTOMATICA';
          }
        }
      }

      const insertRes = db
        .prepare(
          `INSERT INTO tickets (
             code, reporter_id, department_id, category_id, incident_type, priority,
             subject, description, workstation_code, assigned_technician_id, status,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`
        )
        .run(
          ticketCode,
          reporterId,
          departmentId,
          category.id,
          parsed.incidentType,
          parsed.priority,
          parsed.subject,
          parsed.description,
          parsed.workstationCode || null,
          assignedTechId,
          now,
          now
        );

      const ticketId = Number(insertRes.lastInsertRowid);

      // Historial inicial inmutable
      db.prepare(
        `INSERT INTO ticket_status_history (ticket_id, previous_status, new_status, changed_by_user_id, comment, created_at)
         VALUES (?, NULL, 'PENDIENTE', ?, ?, ?)`
      ).run(
        ticketId,
        currentUser.id,
        assignedTechName
          ? `Incidencia registrada y asignada (${assignmentMode === 'AUTOMATICA' ? 'automáticamente' : 'manualmente'}) a ${assignedTechName}.`
          : 'Incidencia registrada en el sistema. En espera de asignación técnica.',
        now
      );

      // Registrar asignación si aplica
      if (assignedTechId && assignmentMode) {
        db.prepare(
          `INSERT INTO ticket_assignments (ticket_id, previous_technician_id, technician_id, assigned_by_user_id, assignment_mode, reason, created_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?)`
        ).run(
          ticketId,
          assignedTechId,
          assignmentMode === 'MANUAL' ? currentUser.id : null,
          assignmentMode,
          assignmentMode === 'AUTOMATICA'
            ? 'Distribución automática según especialidad y balance de carga activa.'
            : 'Asignación directa durante el registro del ticket.',
          now
        );

        db.prepare('UPDATE technicians SET last_assigned_at = ?, updated_at = ? WHERE id = ?').run(
          now,
          now,
          assignedTechId
        );
      }

      // Guardar archivos adjuntos si fueron enviados
      for (const file of uploadedFiles) {
        db.prepare(
          `INSERT INTO ticket_attachments (ticket_id, uploaded_by_user_id, original_name, stored_name, mime_type, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(ticketId, currentUser.id, file.originalname, file.filename, file.mimetype, file.size, now);
      }

      // Notificaciones reales del sistema
      notifyActiveAdmins(
        {
          excludeUserId: currentUser.id,
          ticketId,
          eventType: 'NUEVA_INCIDENCIA',
          title: `Nueva incidencia ${ticketCode} (${parsed.priority})`,
          message: `${currentUser.fullName} reportó: "${parsed.subject}" [${category.name}].`,
          createdAt: now,
        },
        db
      );

      if (assignedTechUserId && assignedTechUserId !== currentUser.id) {
        createNotification(
          {
            userId: assignedTechUserId,
            ticketId,
            eventType: 'TICKET_ASIGNADO',
            title: `Ticket asignado: ${ticketCode}`,
            message: `Se le asignó la incidencia "${parsed.subject}" con prioridad ${parsed.priority}.`,
            createdAt: now,
          },
          db
        );
      }

      if (reporterId !== currentUser.id) {
        createNotification(
          {
            userId: reporterId,
            ticketId,
            eventType: 'NUEVA_INCIDENCIA',
            title: `Ticket registrado: ${ticketCode}`,
            message: `Soporte TI registró su solicitud "${parsed.subject}".`,
            createdAt: now,
          },
          db
        );
      } else if (assignedTechName) {
        createNotification(
          {
            userId: reporterId,
            ticketId,
            eventType: 'TICKET_ASIGNADO',
            title: `Especialista asignado a ${ticketCode}`,
            message: `Su incidencia fue asignada al técnico ${assignedTechName} para su próxima atención.`,
            createdAt: now,
          },
          db
        );
      }

      recordAuditLog(
        {
          userId: currentUser.id,
          action: 'CREATE_TICKET',
          entity: 'tickets',
          entityId: ticketId,
          details: { code: ticketCode, category: category.code, priority: parsed.priority, assignedTechId },
          ipAddress: req.ip,
          createdAt: now,
        },
        db
      );

      return { id: ticketId, code: ticketCode, assignedTechnicianName: assignedTechName };
    });

    res.status(201).json({
      success: true,
      message: `Incidencia ${createdTicket.code} registrada exitosamente.`,
      data: createdTicket,
    });
  } catch (error) {
    next(error);
  }
}

export function assignTicket(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const ticketId = Number(req.params.id);
    const { technicianId, reason } = assignTicketSchema.parse(req.body);
    const now = new Date().toISOString();

    const result = withTransaction((db) => {
      const ticket = normalizeRow<{
        id: number;
        code: string;
        subject: string;
        status: string;
        reporter_id: number;
        assigned_technician_id: number | null;
      }>(
        db
          .prepare('SELECT id, code, subject, status, reporter_id, assigned_technician_id FROM tickets WHERE id = ?')
          .get(ticketId)
      );

      if (!ticket) {
        throw new AppError('Incidencia no encontrada.', 404);
      }

      if (ticket.status === 'RESUELTO') {
        throw new AppError('No se puede reasignar una incidencia que ya se encuentra resuelta.', 400);
      }

      const tech = normalizeRow<{ id: number; user_id: number; full_name: string; is_active: number }>(
        db
          .prepare(
            `SELECT t.id, t.user_id, u.full_name, u.is_active
             FROM technicians t
             INNER JOIN users u ON u.id = t.user_id
             WHERE t.id = ?`
          )
          .get(technicianId)
      );

      if (!tech || !tech.is_active) {
        throw new AppError('El técnico seleccionado no existe o su cuenta está inactiva.', 400);
      }

      if (Number(ticket.assigned_technician_id) === Number(tech.id)) {
        throw new AppError('La incidencia ya se encuentra asignada a este técnico.', 400);
      }

      const previousTechId = ticket.assigned_technician_id ? Number(ticket.assigned_technician_id) : null;
      const mode = previousTechId ? 'REASIGNACION' : 'MANUAL';

      db.prepare('UPDATE tickets SET assigned_technician_id = ?, updated_at = ? WHERE id = ?').run(
        tech.id,
        now,
        ticketId
      );
      db.prepare('UPDATE technicians SET last_assigned_at = ?, updated_at = ? WHERE id = ?').run(now, now, tech.id);

      db.prepare(
        `INSERT INTO ticket_assignments (ticket_id, previous_technician_id, technician_id, assigned_by_user_id, assignment_mode, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ticketId,
        previousTechId,
        tech.id,
        currentUser.id,
        mode,
        reason || (mode === 'REASIGNACION' ? 'Reasignación operativa por administrador.' : 'Asignación manual por administrador.'),
        now
      );

      // Notificar al nuevo técnico
      createNotification(
        {
          userId: Number(tech.user_id),
          ticketId,
          eventType: 'TICKET_ASIGNADO',
          title: `${mode === 'REASIGNACION' ? 'Ticket reasignado' : 'Nuevo ticket asignado'}: ${ticket.code}`,
          message: `El administrador ${currentUser.fullName} le asignó la incidencia "${ticket.subject}".`,
          createdAt: now,
        },
        db
      );

      // Notificar al colaborador reportante
      createNotification(
        {
          userId: Number(ticket.reporter_id),
          ticketId,
          eventType: 'TICKET_ASIGNADO',
          title: `Actualización de asignación en ${ticket.code}`,
          message: `El especialista ${tech.full_name} ha sido asignado para atender su incidencia.`,
          createdAt: now,
        },
        db
      );

      recordAuditLog(
        {
          userId: currentUser.id,
          action: mode === 'REASIGNACION' ? 'REASSIGN_TICKET' : 'ASSIGN_TICKET',
          entity: 'tickets',
          entityId: ticketId,
          details: { code: ticket.code, previousTechId, newTechId: tech.id, reason },
          ipAddress: req.ip,
          createdAt: now,
        },
        db
      );

      return { code: ticket.code, technicianName: tech.full_name, mode };
    });

    res.json({
      success: true,
      message: `Incidencia ${result.code} asignada correctamente a ${result.technicianName}.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export function autoAssignPendingTickets(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const now = new Date().toISOString();

    const assignedSummary = withTransaction((db) => {
      const pendingTickets = normalizeRows<{
        id: number;
        code: string;
        subject: string;
        reporter_id: number;
        category_code: string;
      }>(
        db
          .prepare(
            `SELECT tk.id, tk.code, tk.subject, tk.reporter_id, c.code AS category_code
             FROM tickets tk
             INNER JOIN categories c ON c.id = tk.category_id
             WHERE tk.assigned_technician_id IS NULL AND tk.status = 'PENDIENTE'
             ORDER BY
               CASE tk.priority
                 WHEN 'CRITICA' THEN 1
                 WHEN 'ALTA' THEN 2
                 WHEN 'MEDIA' THEN 3
                 ELSE 4
               END ASC,
               tk.created_at ASC`
          )
          .all()
      );

      let assignedCount = 0;
      for (const tk of pendingTickets) {
        const optimal = selectOptimalTechnician(String(tk.category_code), db);
        if (!optimal) break;

        db.prepare('UPDATE tickets SET assigned_technician_id = ?, updated_at = ? WHERE id = ?').run(
          optimal.technicianId,
          now,
          tk.id
        );
        db.prepare('UPDATE technicians SET last_assigned_at = ?, updated_at = ? WHERE id = ?').run(
          now,
          now,
          optimal.technicianId
        );
        db.prepare(
          `INSERT INTO ticket_assignments (ticket_id, previous_technician_id, technician_id, assigned_by_user_id, assignment_mode, reason, created_at)
           VALUES (?, NULL, ?, ?, 'AUTOMATICA', 'Balanceo automático de cola pendiente.', ?)`
        ).run(tk.id, optimal.technicianId, currentUser.id, now);

        createNotification(
          {
            userId: optimal.userId,
            ticketId: Number(tk.id),
            eventType: 'TICKET_ASIGNADO',
            title: `Ticket asignado automáticamente: ${tk.code}`,
            message: `Se le asignó la incidencia "${tk.subject}" mediante balanceo de carga.`,
            createdAt: now,
          },
          db
        );

        createNotification(
          {
            userId: Number(tk.reporter_id),
            ticketId: Number(tk.id),
            eventType: 'TICKET_ASIGNADO',
            title: `Especialista asignado a ${tk.code}`,
            message: `Su incidencia fue asignada al técnico ${optimal.fullName}.`,
            createdAt: now,
          },
          db
        );

        assignedCount++;
      }

      if (assignedCount > 0) {
        recordAuditLog(
          {
            userId: currentUser.id,
            action: 'BATCH_AUTO_ASSIGN',
            entity: 'tickets',
            details: { assignedCount, totalPendingEvaluated: pendingTickets.length },
            ipAddress: req.ip,
            createdAt: now,
          },
          db
        );
      }

      return { assignedCount, totalPending: pendingTickets.length };
    });

    res.json({
      success: true,
      message:
        assignedSummary.assignedCount > 0
          ? `Se asignaron automáticamente ${assignedSummary.assignedCount} incidencias pendientes.`
          : 'No se encontraron incidencias sin asignar o técnicos disponibles con capacidad libre.',
      data: assignedSummary,
    });
  } catch (error) {
    next(error);
  }
}

export function updateTicketStatus(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const ticketId = Number(req.params.id);
    const parsed = updateStatusSchema.parse(req.body);
    const now = new Date().toISOString();

    withTransaction((db) => {
      const ticket = normalizeRow<{
        id: number;
        code: string;
        subject: string;
        status: string;
        reporter_id: number;
        assigned_technician_id: number | null;
        diagnosis: string | null;
        solution: string | null;
        first_response_at: string | null;
        resolved_at: string | null;
      }>(db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId));

      if (!ticket) {
        throw new AppError('Incidencia no encontrada.', 404);
      }

      if (currentUser.role === 'TECNICO' && Number(ticket.assigned_technician_id) !== Number(currentUser.technicianId)) {
        throw new AppError('Solo el técnico asignado o un administrador puede actualizar este ticket.', 403, 'FORBIDDEN');
      }

      if (ticket.status === parsed.status) {
        throw new AppError(`La incidencia ya se encuentra en estado ${parsed.status}.`, 400);
      }

      if (!ticket.assigned_technician_id && parsed.status !== 'PENDIENTE') {
        if (currentUser.role === 'TECNICO' && currentUser.technicianId) {
          // Auto-adjudicar si un técnico inicia atención directa
          db.prepare('UPDATE tickets SET assigned_technician_id = ? WHERE id = ?').run(
            currentUser.technicianId,
            ticketId
          );
        } else {
          throw new AppError(
            'Debe asignar un técnico responsable antes de pasar la incidencia a En proceso o Resuelto.',
            400,
            'TECH_REQUIRED'
          );
        }
      }

      const nextDiagnosis =
        parsed.diagnosis !== undefined && parsed.diagnosis !== null
          ? parsed.diagnosis.trim() || ticket.diagnosis
          : ticket.diagnosis;
      const nextSolution =
        parsed.solution !== undefined && parsed.solution !== null
          ? parsed.solution.trim() || ticket.solution
          : ticket.solution;

      if (parsed.status === 'RESUELTO') {
        if (!nextDiagnosis || nextDiagnosis.trim().length < 5) {
          throw new AppError(
            'Para marcar la incidencia como RESUELTO es obligatorio registrar el diagnóstico técnico.',
            400,
            'DIAGNOSIS_REQUIRED'
          );
        }
        if (!nextSolution || nextSolution.trim().length < 5) {
          throw new AppError(
            'Para marcar la incidencia como RESUELTO es obligatorio registrar la solución aplicada.',
            400,
            'SOLUTION_REQUIRED'
          );
        }
      }

      // KPI 1: Registrar primera respuesta documentada si aún no existe
      const firstResponseAt =
        ticket.first_response_at ||
        (parsed.status === 'EN_PROCESO' || parsed.status === 'RESUELTO' ? now : null);

      const resolvedAt = parsed.status === 'RESUELTO' ? now : null;

      db.prepare(
        `UPDATE tickets
         SET status = ?,
             diagnosis = ?,
             solution = ?,
             first_response_at = ?,
             resolved_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(parsed.status, nextDiagnosis || null, nextSolution || null, firstResponseAt, resolvedAt, now, ticketId);

      // Historial inmutable (Módulo 4)
      db.prepare(
        `INSERT INTO ticket_status_history (ticket_id, previous_status, new_status, changed_by_user_id, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(ticketId, ticket.status, parsed.status, currentUser.id, parsed.comment, now);

      // Notificaciones de acuerdo al nuevo estado (Módulo 8)
      if (parsed.status === 'EN_PROCESO' && ticket.status === 'PENDIENTE') {
        createNotification(
          {
            userId: Number(ticket.reporter_id),
            ticketId,
            eventType: 'INCIDENCIA_INICIADA',
            title: `Atención iniciada en ${ticket.code}`,
            message: `${currentUser.fullName} inició la atención de su solicitud: "${parsed.comment}".`,
            createdAt: now,
          },
          db
        );
      } else if (parsed.status === 'RESUELTO') {
        createNotification(
          {
            userId: Number(ticket.reporter_id),
            ticketId,
            eventType: 'INCIDENCIA_RESUELTA',
            title: `Incidencia resuelta: ${ticket.code}`,
            message: `Su incidencia "${ticket.subject}" ha sido resuelta. Solución: ${nextSolution}`,
            createdAt: now,
          },
          db
        );

        notifyActiveAdmins(
          {
            excludeUserId: currentUser.id,
            ticketId,
            eventType: 'INCIDENCIA_RESUELTA',
            title: `Ticket resuelto: ${ticket.code}`,
            message: `${currentUser.fullName} finalizó la atención del ticket "${ticket.subject}".`,
            createdAt: now,
          },
          db
        );
      } else {
        createNotification(
          {
            userId: Number(ticket.reporter_id),
            ticketId,
            eventType: 'CAMBIO_ESTADO',
            title: `Cambio de estado en ${ticket.code}`,
            message: `El estado cambió de ${ticket.status} a ${parsed.status}. Observación: ${parsed.comment}`,
            createdAt: now,
          },
          db
        );
      }

      recordAuditLog(
        {
          userId: currentUser.id,
          action: 'CHANGE_TICKET_STATUS',
          entity: 'tickets',
          entityId: ticketId,
          details: { code: ticket.code, from: ticket.status, to: parsed.status },
          ipAddress: req.ip,
          createdAt: now,
        },
        db
      );
    });

    res.json({
      success: true,
      message: `Estado actualizado a ${parsed.status} correctamente.`,
    });
  } catch (error) {
    next(error);
  }
}

export function updateTechnicalNotes(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const ticketId = Number(req.params.id);
    const parsed = updateTechnicalNotesSchema.parse(req.body);
    const now = new Date().toISOString();

    const db = getDb();
    const ticket = normalizeRow<{
      id: number;
      code: string;
      assigned_technician_id: number | null;
      first_response_at: string | null;
    }>(db.prepare('SELECT id, code, assigned_technician_id, first_response_at FROM tickets WHERE id = ?').get(ticketId));

    if (!ticket) {
      throw new AppError('Incidencia no encontrada.', 404);
    }

    if (currentUser.role === 'TECNICO' && Number(ticket.assigned_technician_id) !== Number(currentUser.technicianId)) {
      throw new AppError('No tiene permiso para editar el diagnóstico de este ticket.', 403, 'FORBIDDEN');
    }

    const firstResponseAt =
      ticket.first_response_at || ((parsed.diagnosis && parsed.diagnosis.length > 0) ? now : null);

    db.prepare(
      `UPDATE tickets
       SET diagnosis = COALESCE(?, diagnosis),
           solution = COALESCE(?, solution),
           first_response_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(parsed.diagnosis ?? null, parsed.solution ?? null, firstResponseAt, now, ticketId);

    recordAuditLog({
      userId: currentUser.id,
      action: 'UPDATE_TECHNICAL_NOTES',
      entity: 'tickets',
      entityId: ticketId,
      details: { code: ticket.code },
      ipAddress: req.ip,
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Diagnóstico y solución técnica guardados correctamente.',
    });
  } catch (error) {
    next(error);
  }
}

export function addTicketComment(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const ticketId = Number(req.params.id);
    const parsed = addCommentSchema.parse(req.body);
    const now = new Date().toISOString();

    withTransaction((db) => {
      const ticket = normalizeRow<{
        id: number;
        code: string;
        subject: string;
        reporter_id: number;
        assigned_technician_id: number | null;
        first_response_at: string | null;
      }>(
        db
          .prepare(
            'SELECT id, code, subject, reporter_id, assigned_technician_id, first_response_at FROM tickets WHERE id = ?'
          )
          .get(ticketId)
      );

      if (!ticket) {
        throw new AppError('Incidencia no encontrada.', 404);
      }

      if (currentUser.role === 'COLABORADOR' && Number(ticket.reporter_id) !== currentUser.id) {
        throw new AppError('No puede comentar en incidencias de otros colaboradores.', 403, 'FORBIDDEN');
      }

      if (currentUser.role === 'TECNICO' && Number(ticket.assigned_technician_id) !== Number(currentUser.technicianId)) {
        throw new AppError('Solo el técnico asignado puede agregar comentarios operativos en este ticket.', 403);
      }

      const isInternal = currentUser.role === 'COLABORADOR' ? false : Boolean(parsed.isInternal);

      db.prepare(
        `INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(ticketId, currentUser.id, parsed.content, isInternal ? 1 : 0, now);

      // Si es la primera respuesta pública de un técnico o admin al colaborador, registrar first_response_at
      if (currentUser.role !== 'COLABORADOR' && !isInternal && !ticket.first_response_at) {
        db.prepare('UPDATE tickets SET first_response_at = ?, updated_at = ? WHERE id = ?').run(now, now, ticketId);
      } else {
        db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now, ticketId);
      }

      // Notificar contraparte
      if (currentUser.role === 'COLABORADOR') {
        if (ticket.assigned_technician_id) {
          const techUser = normalizeRow<{ user_id: number }>(
            db.prepare('SELECT user_id FROM technicians WHERE id = ?').get(ticket.assigned_technician_id)
          );
          if (techUser) {
            createNotification(
              {
                userId: Number(techUser.user_id),
                ticketId,
                eventType: 'NUEVO_COMENTARIO',
                title: `Nuevo comentario en ${ticket.code}`,
                message: `${currentUser.fullName} comentó: "${parsed.content.slice(0, 120)}"`,
                createdAt: now,
              },
              db
            );
          }
        } else {
          notifyActiveAdmins(
            {
              excludeUserId: currentUser.id,
              ticketId,
              eventType: 'NUEVO_COMENTARIO',
              title: `Comentario en ticket sin asignar ${ticket.code}`,
              message: `${currentUser.fullName} agregó información en "${ticket.subject}".`,
              createdAt: now,
            },
            db
          );
        }
      } else if (!isInternal && Number(ticket.reporter_id) !== currentUser.id) {
        createNotification(
          {
            userId: Number(ticket.reporter_id),
            ticketId,
            eventType: 'NUEVO_COMENTARIO',
            title: `Respuesta de Soporte TI en ${ticket.code}`,
            message: `${currentUser.fullName}: "${parsed.content.slice(0, 120)}"`,
            createdAt: now,
          },
          db
        );
      }
    });

    res.status(201).json({
      success: true,
      message: 'Comentario registrado correctamente.',
    });
  } catch (error) {
    next(error);
  }
}

export function uploadTicketAttachments(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const currentUser = req.user;
    const ticketId = Number(req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) || [];

    if (files.length === 0) {
      throw new AppError('Seleccione al menos un archivo válido para adjuntar.', 400);
    }

    const db = getDb();
    const ticket = normalizeRow<{ id: number; reporter_id: number; assigned_technician_id: number | null }>(
      db.prepare('SELECT id, reporter_id, assigned_technician_id FROM tickets WHERE id = ?').get(ticketId)
    );

    if (!ticket) {
      throw new AppError('Incidencia no encontrada.', 404);
    }

    if (currentUser.role === 'COLABORADOR' && Number(ticket.reporter_id) !== currentUser.id) {
      throw new AppError('No tiene permiso para adjuntar archivos en este ticket.', 403);
    }

    if (currentUser.role === 'TECNICO' && Number(ticket.assigned_technician_id) !== Number(currentUser.technicianId)) {
      throw new AppError('Solo el técnico asignado puede adjuntar evidencias en este ticket.', 403);
    }

    const now = new Date().toISOString();
    withTransaction((tx) => {
      for (const file of files) {
        tx.prepare(
          `INSERT INTO ticket_attachments (ticket_id, uploaded_by_user_id, original_name, stored_name, mime_type, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(ticketId, currentUser.id, file.originalname, file.filename, file.mimetype, file.size, now);
      }
      tx.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now, ticketId);
    });

    res.status(201).json({
      success: true,
      message: `${files.length} archivo(s) adjuntado(s) correctamente.`,
    });
  } catch (error) {
    next(error);
  }
}

export function downloadTicketAttachment(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const ticketId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);

    const db = getDb();
    const row = normalizeRow<{
      original_name: string;
      stored_name: string;
      mime_type: string;
      reporter_id: number;
      assigned_technician_id: number | null;
      status: string;
    }>(
      db
        .prepare(
          `SELECT att.original_name, att.stored_name, att.mime_type,
                  tk.reporter_id, tk.assigned_technician_id, tk.status
           FROM ticket_attachments att
           INNER JOIN tickets tk ON tk.id = att.ticket_id
           WHERE att.id = ? AND att.ticket_id = ?`
        )
        .get(attachmentId, ticketId)
    );

    if (!row) {
      throw new AppError('Archivo adjunto no encontrado.', 404);
    }

    if (req.user.role === 'COLABORADOR' && Number(row.reporter_id) !== req.user.id) {
      throw new AppError('Acceso denegado al archivo adjunto.', 403);
    }

    if (
      req.user.role === 'TECNICO' &&
      Number(row.assigned_technician_id) !== Number(req.user.technicianId) &&
      String(row.status) !== 'RESUELTO'
    ) {
      throw new AppError('Acceso denegado al archivo adjunto.', 403);
    }

    const filePath = path.join(env.uploadDir, String(row.stored_name));
    if (!fs.existsSync(filePath)) {
      throw new AppError('El archivo físico no se encuentra disponible en el servidor.', 404);
    }

    res.setHeader('Content-Type', String(row.mime_type));
    res.download(filePath, String(row.original_name));
  } catch (error) {
    next(error);
  }
}
