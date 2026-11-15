import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDb, normalizeRow } from '../database/connection';
import { AppError } from '../middlewares/error.middleware';
import { recordAuditLog } from '../services/audit.service';
import { RoleCode, signAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';

const loginSchema = z.object({
  email: z.string().trim().email('Ingrese un correo electrónico válido.'),
  password: z.string().min(4, 'Ingrese su contraseña.'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingrese su contraseña actual.'),
  newPassword: z
    .string()
    .min(6, 'La nueva contraseña debe tener al menos 6 caracteres.')
    .max(72, 'La contraseña no puede exceder 72 caracteres.'),
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(120),
  phone: z.string().trim().max(30).optional().nullable(),
});

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const db = getDb();

    const userRow = normalizeRow(
      db
        .prepare(
          `SELECT u.id, u.employee_code, u.full_name, u.email, u.password_hash, u.phone,
                  u.is_active, u.role_id, r.code AS role_code, r.name AS role_name,
                  u.department_id, d.name AS department_name, d.site AS department_site,
                  t.id AS technician_id, t.specialty, t.support_level, t.is_available
           FROM users u
           INNER JOIN roles r ON r.id = u.role_id
           INNER JOIN departments d ON d.id = u.department_id
           LEFT JOIN technicians t ON t.user_id = u.id
           WHERE LOWER(u.email) = LOWER(?)`
        )
        .get(email)
    );

    if (!userRow) {
      throw new AppError('Credenciales incorrectas. Verifique su correo y contraseña.', 401, 'INVALID_CREDENTIALS');
    }

    const passwordValid = await verifyPassword(password, String(userRow.password_hash));
    if (!passwordValid) {
      throw new AppError('Credenciales incorrectas. Verifique su correo y contraseña.', 401, 'INVALID_CREDENTIALS');
    }

    if (!userRow.is_active) {
      throw new AppError(
        'Su cuenta corporativa se encuentra desactivada. Comuníquese con el Administrador de Soporte TI.',
        403,
        'USER_INACTIVE'
      );
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, userRow.id);

    const token = signAccessToken({
      userId: Number(userRow.id),
      email: String(userRow.email),
      role: userRow.role_code as RoleCode,
      employeeCode: String(userRow.employee_code),
    });

    const unreadRow = normalizeRow<{ count: number }>(
      db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(userRow.id)
    );

    recordAuditLog({
      userId: Number(userRow.id),
      action: 'LOGIN',
      entity: 'users',
      entityId: Number(userRow.id),
      details: { email: userRow.email, role: userRow.role_code },
      ipAddress: req.ip,
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      data: {
        token,
        user: {
          id: Number(userRow.id),
          employeeCode: String(userRow.employee_code),
          fullName: String(userRow.full_name),
          email: String(userRow.email),
          phone: userRow.phone ? String(userRow.phone) : null,
          role: userRow.role_code as RoleCode,
          roleName: String(userRow.role_name),
          departmentId: Number(userRow.department_id),
          departmentName: String(userRow.department_name),
          departmentSite: String(userRow.department_site),
          technicianId: userRow.technician_id ? Number(userRow.technician_id) : null,
          specialty: userRow.specialty ? String(userRow.specialty) : null,
          supportLevel: userRow.support_level ? String(userRow.support_level) : null,
          isAvailable: userRow.is_available !== null && userRow.is_available !== undefined ? Boolean(userRow.is_available) : null,
          unreadNotifications: Number(unreadRow?.count || 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export function getMe(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new AppError('No autenticado.', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    const userRow = normalizeRow(
      db
        .prepare(
          `SELECT u.id, u.employee_code, u.full_name, u.email, u.phone, u.last_login_at, u.created_at,
                  r.code AS role_code, r.name AS role_name,
                  u.department_id, d.name AS department_name, d.site AS department_site,
                  t.id AS technician_id, t.specialty, t.specialty_category_code, t.support_level,
                  t.max_concurrent_tickets, t.is_available
           FROM users u
           INNER JOIN roles r ON r.id = u.role_id
           INNER JOIN departments d ON d.id = u.department_id
           LEFT JOIN technicians t ON t.user_id = u.id
           WHERE u.id = ?`
        )
        .get(req.user.id)
    );

    if (!userRow) {
      throw new AppError('Usuario no encontrado.', 404, 'NOT_FOUND');
    }

    const unreadRow = normalizeRow<{ count: number }>(
      db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id)
    );

    res.json({
      success: true,
      data: {
        id: Number(userRow.id),
        employeeCode: String(userRow.employee_code),
        fullName: String(userRow.full_name),
        email: String(userRow.email),
        phone: userRow.phone ? String(userRow.phone) : null,
        role: userRow.role_code as RoleCode,
        roleName: String(userRow.role_name),
        departmentId: Number(userRow.department_id),
        departmentName: String(userRow.department_name),
        departmentSite: String(userRow.department_site),
        technicianId: userRow.technician_id ? Number(userRow.technician_id) : null,
        specialty: userRow.specialty ? String(userRow.specialty) : null,
        specialtyCategoryCode: userRow.specialty_category_code ? String(userRow.specialty_category_code) : null,
        supportLevel: userRow.support_level ? String(userRow.support_level) : null,
        maxConcurrentTickets: userRow.max_concurrent_tickets ? Number(userRow.max_concurrent_tickets) : null,
        isAvailable:
          userRow.is_available !== null && userRow.is_available !== undefined ? Boolean(userRow.is_available) : null,
        lastLoginAt: userRow.last_login_at ? String(userRow.last_login_at) : null,
        createdAt: String(userRow.created_at),
        unreadNotifications: Number(unreadRow?.count || 0),
      },
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req: Request, res: Response, next: NextFunction): void {
  try {
    if (req.user) {
      recordAuditLog({
        userId: req.user.id,
        action: 'LOGOUT',
        entity: 'users',
        entityId: req.user.id,
        ipAddress: req.ip,
      });
    }
    res.json({
      success: true,
      message: 'Sesión cerrada correctamente.',
    });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const db = getDb();

    const row = normalizeRow<{ password_hash: string }>(
      db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id)
    );
    if (!row) throw new AppError('Usuario no encontrado.', 404);

    const valid = await verifyPassword(currentPassword, row.password_hash);
    if (!valid) {
      throw new AppError('La contraseña actual ingresada no es correcta.', 400, 'INVALID_CURRENT_PASSWORD');
    }

    const newHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, req.user.id);

    recordAuditLog({
      userId: req.user.id,
      action: 'CHANGE_PASSWORD',
      entity: 'users',
      entityId: req.user.id,
      ipAddress: req.ip,
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente.',
    });
  } catch (error) {
    next(error);
  }
}

export function updateOwnProfile(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) throw new AppError('No autenticado.', 401);
    const { fullName, phone } = updateProfileSchema.parse(req.body);
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?').run(
      fullName,
      phone || null,
      now,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Perfil actualizado correctamente.',
    });
  } catch (error) {
    next(error);
  }
}
