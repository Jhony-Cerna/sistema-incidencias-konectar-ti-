import { Request, Response, NextFunction } from 'express';
import { getDb, normalizeRow } from '../database/connection';
import { RoleCode, verifyAccessToken } from '../utils/jwt';
import { AppError } from './error.middleware';

export interface AuthenticatedUser {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  role: RoleCode;
  roleId: number;
  departmentId: number;
  departmentName: string;
  technicianId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware de autenticación JWT que además verifica en la base de datos
 * que el usuario exista y su cuenta siga activa en tiempo real.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No autenticado. Inicie sesión para acceder al recurso.', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError('Token de sesión no proporcionado.', 401, 'UNAUTHORIZED');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError('La sesión ha expirado o el token es inválido.', 401, 'INVALID_TOKEN');
    }

    const db = getDb();
    const row = normalizeRow(
      db
        .prepare(
          `SELECT u.id, u.employee_code, u.full_name, u.email, u.is_active,
                  u.role_id, r.code AS role_code,
                  u.department_id, d.name AS department_name,
                  t.id AS technician_id
           FROM users u
           INNER JOIN roles r ON r.id = u.role_id
           INNER JOIN departments d ON d.id = u.department_id
           LEFT JOIN technicians t ON t.user_id = u.id
           WHERE u.id = ?`
        )
        .get(payload.userId)
    );

    if (!row) {
      throw new AppError('El usuario asociado a la sesión ya no existe.', 401, 'USER_NOT_FOUND');
    }

    if (!row.is_active) {
      throw new AppError('Su cuenta se encuentra desactivada. Contacte al Administrador TI.', 403, 'USER_INACTIVE');
    }

    req.user = {
      id: Number(row.id),
      employeeCode: String(row.employee_code),
      fullName: String(row.full_name),
      email: String(row.email),
      role: row.role_code as RoleCode,
      roleId: Number(row.role_id),
      departmentId: Number(row.department_id),
      departmentName: String(row.department_name),
      technicianId: row.technician_id ? Number(row.technician_id) : null,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware de autorización RBAC por roles permitidos.
 */
export function authorize(...allowedRoles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('No autenticado.', 401, 'UNAUTHORIZED'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          'Acceso denegado: no cuenta con los permisos necesarios para realizar esta acción.',
          403,
          'FORBIDDEN'
        )
      );
      return;
    }

    next();
  };
}
