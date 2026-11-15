import { DatabaseSync } from 'node:sqlite';

/**
 * Genera de forma atómica un código único correlativo de incidencia (ej: INC-2026-0001).
 * Debe invocarse dentro de una transacción activa (BEGIN IMMEDIATE) para garantizar
 * cero colisiones aún ante múltiples registros simultáneos.
 */
export function generateNextTicketCode(db: DatabaseSync, dateIso?: string): string {
  const year = dateIso ? new Date(dateIso).getUTCFullYear() : new Date().getUTCFullYear();

  const existing = db.prepare('SELECT last_number FROM ticket_sequences WHERE year = ?').get(year) as
    | { last_number: number }
    | undefined;

  let nextNumber = 1;
  if (!existing) {
    db.prepare('INSERT INTO ticket_sequences (year, last_number) VALUES (?, ?)').run(year, nextNumber);
  } else {
    nextNumber = Number(existing.last_number) + 1;
    db.prepare('UPDATE ticket_sequences SET last_number = ? WHERE year = ?').run(nextNumber, year);
  }

  return `INC-${year}-${String(nextNumber).padStart(4, '0')}`;
}
