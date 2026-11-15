import { DatabaseSync } from 'node:sqlite';
import { getDb, normalizeRow, normalizeRows } from '../database/connection';

export interface TechnicianWorkload {
  technicianId: number;
  userId: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  specialty: string;
  specialtyCategoryCode: string;
  supportLevel: string;
  maxConcurrentTickets: number;
  isAvailable: boolean;
  isUserActive: boolean;
  lastAssignedAt: string | null;
  pendingCount: number;
  inProgressCount: number;
  activeLoad: number;
  resolvedCount: number;
  totalAssigned: number;
  loadPercentage: number;
  avgFirstResponseMinutes: number | null;
}

/**
 * Obtiene la lista completa de técnicos con su disponibilidad y carga de trabajo real
 * calculada directamente desde la base de datos relacional.
 */
export function getTechniciansWithWorkload(txDb?: DatabaseSync): TechnicianWorkload[] {
  const db = txDb || getDb();
  const rows = normalizeRows(
    db
      .prepare(
        `SELECT
           t.id AS technician_id,
           u.id AS user_id,
           u.employee_code,
           u.full_name,
           u.email,
           u.phone,
           u.is_active AS is_user_active,
           t.specialty,
           t.specialty_category_code,
           t.support_level,
           t.max_concurrent_tickets,
           t.is_available,
           t.last_assigned_at,
           SUM(CASE WHEN tk.status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN tk.status = 'EN_PROCESO' THEN 1 ELSE 0 END) AS in_progress_count,
           SUM(CASE WHEN tk.status IN ('PENDIENTE', 'EN_PROCESO') THEN 1 ELSE 0 END) AS active_load,
           SUM(CASE WHEN tk.status = 'RESUELTO' THEN 1 ELSE 0 END) AS resolved_count,
           COUNT(tk.id) AS total_assigned,
           ROUND(
             AVG(
               CASE
                 WHEN tk.first_response_at IS NOT NULL
                 THEN (julianday(tk.first_response_at) - julianday(tk.created_at)) * 1440.0
                 ELSE NULL
               END
             ),
             1
           ) AS avg_first_response_minutes
         FROM technicians t
         INNER JOIN users u ON u.id = t.user_id
         LEFT JOIN tickets tk ON tk.assigned_technician_id = t.id
         GROUP BY t.id
         ORDER BY u.is_active DESC, t.is_available DESC, active_load ASC, u.full_name ASC`
      )
      .all()
  );

  return rows.map((r) => {
    const maxConcurrent = Number(r.max_concurrent_tickets || 8);
    const activeLoad = Number(r.active_load || 0);
    return {
      technicianId: Number(r.technician_id),
      userId: Number(r.user_id),
      employeeCode: String(r.employee_code),
      fullName: String(r.full_name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      specialty: String(r.specialty),
      specialtyCategoryCode: String(r.specialty_category_code),
      supportLevel: String(r.support_level),
      maxConcurrentTickets: maxConcurrent,
      isAvailable: Boolean(r.is_available),
      isUserActive: Boolean(r.is_user_active),
      lastAssignedAt: r.last_assigned_at ? String(r.last_assigned_at) : null,
      pendingCount: Number(r.pending_count || 0),
      inProgressCount: Number(r.in_progress_count || 0),
      activeLoad,
      resolvedCount: Number(r.resolved_count || 0),
      totalAssigned: Number(r.total_assigned || 0),
      loadPercentage: Math.min(100, Math.round((activeLoad / maxConcurrent) * 100)),
      avgFirstResponseMinutes:
        r.avg_first_response_minutes !== null && r.avg_first_response_minutes !== undefined
          ? Number(r.avg_first_response_minutes)
          : null,
    };
  });
}

export function getAutoAssignmentSettings(txDb?: DatabaseSync): {
  enabled: boolean;
  strategy: 'SPECIALTY_AND_WORKLOAD' | 'LEAST_WORKLOAD';
} {
  const db = txDb || getDb();
  const enabledRow = normalizeRow<{ value: string }>(
    db.prepare(`SELECT value FROM system_settings WHERE key = 'auto_assign_enabled'`).get()
  );
  const strategyRow = normalizeRow<{ value: string }>(
    db.prepare(`SELECT value FROM system_settings WHERE key = 'auto_assign_strategy'`).get()
  );

  return {
    enabled: enabledRow ? enabledRow.value === 'true' : true,
    strategy:
      strategyRow?.value === 'LEAST_WORKLOAD' ? 'LEAST_WORKLOAD' : 'SPECIALTY_AND_WORKLOAD',
  };
}

/**
 * Selecciona dinámicamente el técnico óptimo considerando:
 * 1. Cuenta de usuario activa y técnico marcado como disponible.
 * 2. Capacidad disponible (carga activa < max_concurrent_tickets).
 * 3. Afinidad de especialidad con la categoría del ticket (si la estrategia lo indica).
 * 4. Menor carga activa actual (tickets PENDIENTE + EN_PROCESO).
 * 5. Desempate equitativo Round-Robin (quien lleve más tiempo sin recibir ticket).
 */
export function selectOptimalTechnician(
  categoryCode: string,
  txDb?: DatabaseSync,
  strategyOverride?: 'SPECIALTY_AND_WORKLOAD' | 'LEAST_WORKLOAD'
): TechnicianWorkload | null {
  const db = txDb || getDb();
  const settings = getAutoAssignmentSettings(db);
  const strategy = strategyOverride || settings.strategy;

  const technicians = getTechniciansWithWorkload(db).filter(
    (t) => t.isUserActive && t.isAvailable && t.activeLoad < t.maxConcurrentTickets
  );

  if (technicians.length === 0) {
    return null;
  }

  const compareByLoadAndRecency = (a: TechnicianWorkload, b: TechnicianWorkload): number => {
    if (a.activeLoad !== b.activeLoad) {
      return a.activeLoad - b.activeLoad;
    }
    const timeA = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
    const timeB = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
    return timeA - timeB;
  };

  if (strategy === 'SPECIALTY_AND_WORKLOAD') {
    const specialists = technicians.filter((t) => t.specialtyCategoryCode === categoryCode);
    if (specialists.length > 0) {
      specialists.sort(compareByLoadAndRecency);
      return specialists[0];
    }
  }

  const sortedAll = [...technicians].sort(compareByLoadAndRecency);
  return sortedAll[0];
}
