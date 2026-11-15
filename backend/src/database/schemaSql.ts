export const SCHEMA_SQL_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('ADMIN', 'TECNICO', 'COLABORADOR')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  site TEXT NOT NULL DEFAULT 'Sede Lima Norte',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  specialty_category_code TEXT NOT NULL DEFAULT 'GENERAL' CHECK (specialty_category_code IN ('HARDWARE', 'SOFTWARE', 'CONECTIVIDAD', 'GENERAL')),
  support_level TEXT NOT NULL DEFAULT 'N1' CHECK (support_level IN ('N1', 'N2')),
  max_concurrent_tickets INTEGER NOT NULL DEFAULT 8 CHECK (max_concurrent_tickets >= 1 AND max_concurrent_tickets <= 50),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  last_assigned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('HARDWARE', 'SOFTWARE', 'CONECTIVIDAD')),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  sla_response_minutes INTEGER NOT NULL DEFAULT 15 CHECK (sla_response_minutes > 0),
  sla_resolution_minutes INTEGER NOT NULL DEFAULT 120 CHECK (sla_resolution_minutes > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ticket_sequences (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  incident_type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  workstation_code TEXT,
  assigned_technician_id INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'EN_PROCESO', 'RESUELTO')),
  diagnosis TEXT,
  solution TEXT,
  first_response_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ticket_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  previous_technician_id INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  technician_id INTEGER NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assignment_mode TEXT NOT NULL CHECK (assignment_mode IN ('AUTOMATICA', 'MANUAL', 'REASIGNACION')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ticket_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('PENDIENTE', 'EN_PROCESO', 'RESUELTO')),
  new_status TEXT NOT NULL CHECK (new_status IN ('PENDIENTE', 'EN_PROCESO', 'RESUELTO')),
  changed_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0 CHECK (is_internal IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('NUEVA_INCIDENCIA', 'TICKET_ASIGNADO', 'INCIDENCIA_INICIADA', 'CAMBIO_ESTADO', 'NUEVO_COMENTARIO', 'INCIDENCIA_RESUELTA')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_technicians_available ON technicians(is_available, specialty_category_code);
CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON tickets(reporter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_kpi_dates ON tickets(created_at, first_response_at, resolved_at);
CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tech ON ticket_assignments(technician_id);
CREATE INDEX IF NOT EXISTS idx_status_history_ticket ON ticket_status_history(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
`;
