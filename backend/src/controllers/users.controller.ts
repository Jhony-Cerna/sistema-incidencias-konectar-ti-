import { SQLInputValue } from 'node:sqlite';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDb, normalizeRow, normalizeRows, withTransaction } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { recordAuditLog } from '../services/audit.service';
import { hashPasswordSync } from '../utils/password';

const createUserSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(3, 'El código de colaborador es obligatorio.')
    .max(25)
    .optional(),
  fullName: z.string().trim().min(3, 'El nombre completo debe tener al menos 3 caracteres.').max(120),
  email: z.string().trim().email('Ingrese un correo electrónico corporativo válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(72),
  phone: z.string().trim().max(30).optional().nullable(),
  roleCode: z.enum(['ADMIN', 'TECNICO', 'COLABORADOR']),
  departmentId: z.coerce.number().int().positive('Seleccione un área o departamento válido.'),
  isActive: z.boolean().optional().default(true),
  // Datos adicionales si el usuario es Técnico de Soporte TI
  specialty: z.string().trim().max(100).optional(),
  specialtyCategoryCode: z.enum(['HARDWARE', 'SOFTWARE', 'CONECTIVIDAD', 'GENERAL']).optional(),
  supportLevel: z.enum(['N1', 'N2']).optional(),
  maxConcurrentTickets: z.coerce.number().int().min(1).max(50).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(3, 'El nombre completo debe tener al menos 3 caracteres.').max(120),
  email: z.string().trim().email('Ingrese un correo electrónico válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(72).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().nullable(),
  roleCode: z.enum(['ADMIN', 'TECNICO', 'COLABORADOR']),
  departmentId: z.coerce.number().int().positive(),
  isActive: z.boolean().optional(),
  specialty: z.string().trim().max(100).optional(),
  specialtyCategoryCode: z.enum(['HARDWARE', 'SOFTWARE', 'CONECTIVIDAD', 'GENERAL']).optional(),
  supportLevel: z.enum(['N1', 'N2']).optional(),
  maxConcurrentTickets: z.coerce.number().int().min(1).max(50).optional(),
  isAvailable: z.boolean().optional(),
});

export function getCatalogs(_req: Request, res: Response, next: NextFunction): void {
  try {
    const db = getDb();
    const roles = normalizeRows(db.prepare('SELECT id, code, name, description FROM roles ORDER BY id ASC').all());
    const departments = normalizeRows(
      db.prepare('SELECT id, code, name, site FROM departments WHERE is_active = 1 ORDER BY name ASC').all()
    );
    const categories = normalizeRows(
      db
        .prepare(
          'SELECT id, code, name, description, sla_response_minutes, sla_resolution_minutes FROM categories WHERE is_active = 1 ORDER BY id ASC'
        )
        .all()
    );

    res.json({
      success: true,
      data: { roles, departments, categories },
    });
  } catch (error) {
    next(error);
  }
}

export function listUsers(req: Request, res: Response, next: NextFunction): void {
  try {
    const db = getDb();
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim();
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;
    const status = String(req.query.status || '').trim();

    const conditions: string[] = [];
    const params: SQLInputValue[] = [];

    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.employee_code LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (role && ['ADMIN', 'TECNICO', 'COLABORADOR'].includes(role)) {
      conditions.push('r.code = ?');
      params.push(role);
    }
    if (departmentId) {
      conditions.push('u.department_id = ?');
      params.push(departmentId);
    }
    if (status === 'ACTIVE') {
      conditions.push('u.is_active = 1');
    } else if (status === 'INACTIVE') {
      conditions.push('u.is_active = 0');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = normalizeRows(
      db
        .prepare(
          `SELECT
             u.id, u.employee_code, u.full_name, u.email, u.phone, u.is_active,
             u.last_login_at, u.created_at, u.updated_at,
             r.id AS role_id, r.code AS role_code, r.name AS role_name,
             d.id AS department_id, d.name AS department_name, d.site AS department_site,
             t.id AS technician_id, t.specialty, t.specialty_category_code,
             t.support_level, t.max_concurrent_tickets, t.is_available,
             (SELECT COUNT(*) FROM tickets tk WHERE tk.reporter_id = u.id) AS reported_tickets_count
           FROM users u
           INNER JOIN roles r ON r.id = u.role_id
           INNER JOIN departments d ON d.id = u.department_id
           LEFT JOIN technicians t ON t.user_id = u.id
           ${whereClause}
           ORDER BY u.is_active DESC, r.id ASC, u.full_name ASC`
        )
        .all(...params)
    );

    const data = rows.map((row) => ({
      id: Number(row.id),
      employeeCode: String(row.employee_code),
      fullName: String(row.full_name),
      email: String(row.email),
      phone: row.phone ? String(row.phone) : null,
      isActive: Boolean(row.is_active),
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      createdAt: String(row.created_at),
      role: String(row.role_code),
      roleName: String(row.role_name),
      departmentId: Number(row.department_id),
      departmentName: String(row.department_name),
      departmentSite: String(row.department_site),
      reportedTicketsCount: Number(row.reported_tickets_count || 0),
      technician: row.technician_id
        ? {
            id: Number(row.technician_id),
            specialty: String(row.specialty),
            specialtyCategoryCode: String(row.specialty_category_code),
            supportLevel: String(row.support_level),
            maxConcurrentTickets: Number(row.max_concurrent_tickets),
            isAvailable: Boolean(row.is_available),
          }
        : null,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export function createUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const parsed = createUserSchema.parse(req.body);
    const passwordHash = hashPasswordSync(parsed.password);
    const now = new Date().toISOString();

    const createdUserId = withTransaction((db) => {
      const existingEmail = normalizeRow(
        db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(parsed.email)
      );
      if (existingEmail) {
        throw new AppError('Ya existe un usuario registrado con ese correo electrónico.', 409, 'EMAIL_EXISTS');
      }

      const roleRow = normalizeRow<{ id: number }>(
        db.prepare('SELECT id FROM roles WHERE code = ?').get(parsed.roleCode)
      );
      if (!roleRow) {
        throw new AppError('El rol seleccionado no es válido.', 400, 'INVALID_ROLE');
      }

      const deptRow = normalizeRow<{ id: number }>(
        db.prepare('SELECT id FROM departments WHERE id = ?').get(parsed.departmentId)
      );
      if (!deptRow) {
        throw new AppError('El departamento seleccionado no existe.', 400, 'INVALID_DEPARTMENT');
      }

      let employeeCode = parsed.employeeCode?.toUpperCase();
      if (!employeeCode) {
        const countRow = normalizeRow<{ total: number }>(db.prepare('SELECT COUNT(*) AS total FROM users').get());
        const nextIdx = Number(countRow?.total || 0) + 101;
        const prefix = parsed.roleCode === 'ADMIN' ? 'ADM' : parsed.roleCode === 'TECNICO' ? 'TEC' : 'COL';
        employeeCode = `KON-${prefix}-${nextIdx}`;
      } else {
        const existingCode = normalizeRow(
          db.prepare('SELECT id FROM users WHERE UPPER(employee_code) = ?').get(employeeCode)
        );
        if (existingCode) {
          throw new AppError('El código de colaborador ingresado ya está en uso.', 409, 'CODE_EXISTS');
        }
      }

      const insertResult = db
        .prepare(
          `INSERT INTO users (employee_code, full_name, email, password_hash, phone, role_id, department_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          employeeCode,
          parsed.fullName,
          parsed.email.toLowerCase(),
          passwordHash,
          parsed.phone || null,
          roleRow.id,
          parsed.departmentId,
          parsed.isActive ? 1 : 0,
          now,
          now
        );

      const newUserId = Number(insertResult.lastInsertRowid);

      if (parsed.roleCode === 'TECNICO') {
        db.prepare(
          `INSERT INTO technicians (user_id, specialty, specialty_category_code, support_level, max_concurrent_tickets, is_available, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        ).run(
          newUserId,
          parsed.specialty || 'Soporte Técnico Nivel 1 & 2',
          parsed.specialtyCategoryCode || 'GENERAL',
          parsed.supportLevel || 'N1',
          parsed.maxConcurrentTickets || 8,
          now,
          now
        );
      }

      recordAuditLog(
        {
          userId: req.user?.id,
          action: 'CREATE_USER',
          entity: 'users',
          entityId: newUserId,
          details: { employeeCode, email: parsed.email, role: parsed.roleCode },
          ipAddress: req.ip,
          createdAt: now,
        },
        db
      );

      return newUserId;
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado correctamente.',
      data: { id: createdUserId },
    });
  } catch (error) {
    next(error);
  }
}

export function updateUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      throw new AppError('Identificador de usuario inválido.', 400);
    }

    const parsed = updateUserSchema.parse(req.body);
    const now = new Date().toISOString();

    withTransaction((db) => {
      const current = normalizeRow(db.prepare('SELECT id, email FROM users WHERE id = ?').get(targetUserId));
      if (!current) {
        throw new AppError('El usuario solicitado no existe.', 404, 'USER_NOT_FOUND');
      }

      if (req.user?.id === targetUserId && parsed.isActive === false) {
        throw new AppError('No puede desactivar su propia cuenta de administrador en sesión.', 400, 'SELF_DEACTIVATE');
      }

      const duplicateEmail = normalizeRow(
        db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(parsed.email, targetUserId)
      );
      if (duplicateEmail) {
        throw new AppError('Otro usuario ya utiliza este correo electrónico.', 409, 'EMAIL_EXISTS');
      }

      const roleRow = normalizeRow<{ id: number }>(
        db.prepare('SELECT id FROM roles WHERE code = ?').get(parsed.roleCode)
      );
      if (!roleRow) {
        throw new AppError('Rol inválido.', 400);
      }

      if (parsed.password && parsed.password.trim().length >= 6) {
        const newHash = hashPasswordSync(parsed.password);
        db.prepare(
          `UPDATE users
           SET full_name = ?, email = ?, password_hash = ?, phone = ?, role_id = ?, department_id = ?,
               is_active = COALESCE(?, is_active), updated_at = ?
           WHERE id = ?`
        ).run(
          parsed.fullName,
          parsed.email.toLowerCase(),
          newHash,
          parsed.phone || null,
          roleRow.id,
          parsed.departmentId,
          parsed.isActive !== undefined ? (parsed.isActive ? 1 : 0) : null,
          now,
          targetUserId
        );
      } else {
        db.prepare(
          `UPDATE users
           SET full_name = ?, email = ?, phone = ?, role_id = ?, department_id = ?,
               is_active = COALESCE(?, is_active), updated_at = ?
           WHERE id = ?`
        ).run(
          parsed.fullName,
          parsed.email.toLowerCase(),
          parsed.phone || null,
          roleRow.id,
          parsed.departmentId,
          parsed.isActive !== undefined ? (parsed.isActive ? 1 : 0) : null,
          now,
          targetUserId
        );
      }

      if (parsed.roleCode === 'TECNICO') {
        const existingTech = normalizeRow<{ id: number }>(
          db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(targetUserId)
        );
        if (existingTech) {
          db.prepare(
            `UPDATE technicians
             SET specialty = COALESCE(?, specialty),
                 specialty_category_code = COALESCE(?, specialty_category_code),
                 support_level = COALESCE(?, support_level),
                 max_concurrent_tickets = COALESCE(?, max_concurrent_tickets),
                 is_available = COALESCE(?, is_available),
                 updated_at = ?
             WHERE user_id = ?`
          ).run(
            parsed.specialty || null,
            parsed.specialtyCategoryCode || null,
            parsed.supportLevel || null,
            parsed.maxConcurrentTickets ?? null,
            parsed.isAvailable !== undefined ? (parsed.isAvailable ? 1 : 0) : null,
            now,
            targetUserId
          );
        } else {
          db.prepare(
            `INSERT INTO technicians (user_id, specialty, specialty_category_code, support_level, max_concurrent_tickets, is_available, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            targetUserId,
            parsed.specialty || 'Soporte Técnico Nivel 1 & 2',
            parsed.specialtyCategoryCode || 'GENERAL',
            parsed.supportLevel || 'N1',
            parsed.maxConcurrentTickets || 8,
            parsed.isAvailable !== false ? 1 : 0,
            now,
            now
          );
        }
      }

      recordAuditLog(
        {
          userId: req.user?.id,
          action: 'UPDATE_USER',
          entity: 'users',
          entityId: targetUserId,
          details: { email: parsed.email, role: parsed.roleCode, isActive: parsed.isActive },
          ipAddress: req.ip,
          createdAt: now,
        },
        db
      );
    });

    res.json({
      success: true,
      message: 'Información del usuario actualizada correctamente.',
    });
  } catch (error) {
    next(error);
  }
}

export function toggleUserStatus(req: Request, res: Response, next: NextFunction): void {
  try {
    const targetUserId = Number(req.params.id);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    if (req.user?.id === targetUserId && !isActive) {
      throw new AppError('No puede desactivar su propia cuenta activa.', 400, 'SELF_DEACTIVATE');
    }

    const db = getDb();
    const userRow = normalizeRow(db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(targetUserId));
    if (!userRow) {
      throw new AppError('Usuario no encontrado.', 404);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?').run(isActive ? 1 : 0, now, targetUserId);

    recordAuditLog({
      userId: req.user?.id,
      action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entity: 'users',
      entityId: targetUserId,
      details: { fullName: userRow.full_name, isActive },
      ipAddress: req.ip,
      createdAt: now,
    });

    res.json({
      success: true,
      message: isActive ? 'Cuenta activada exitosamente.' : 'Cuenta desactivada exitosamente.',
    });
  } catch (error) {
    next(error);
  }
}
