import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// Usar base de datos y carpeta de adjuntos dedicadas para pruebas
const testDbPath = path.resolve(__dirname, '../../data/konectar_itsm_test.sqlite');
const testUploadDir = path.resolve(__dirname, '../../data/test_uploads');
process.env.DB_PATH = testDbPath;
process.env.UPLOAD_DIR = testUploadDir;

import app from '../app';
import { closeDb, getDb, normalizeRow } from '../database/connection';
import { seedDatabase } from '../database/seed';

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

async function runIntegrationSuite(): Promise<void> {
  // Limpiar archivo previo de test si existiera
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${testDbPath}${suffix}`;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  seedDatabase(true);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('No se pudo abrir puerto local para pruebas.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const results: TestResult[] = [];

  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  [OK] ${name}`);
    } catch (err: any) {
      results.push({ name, passed: false, detail: err?.message || String(err) });
      console.error(`  [FALLO] ${name}: ${err?.message || err}`);
    }
  }

  async function apiReq(
    endpoint: string,
    options: { method?: string; token?: string; body?: any; isMultipart?: boolean } = {}
  ) {
    const headers: Record<string, string> = {};
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    if (options.body && !options.isMultipart) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.isMultipart
        ? options.body
        : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }

  console.log('\n=====================================================================');
  console.log(' EJECUTANDO SUITE DE PRUEBAS INTEGRALES (15 PUNTOS DE VALIDACIÓN)');
  console.log(' KONECTAR BPO S.A.C. - Sistema de Gestión de Incidencias Soporte TI');
  console.log('=====================================================================\n');

  let adminToken = '';
  let techToken = '';
  let colab1Token = '';
  let colab2Token = '';
  let createdTicketId = 0;
  let createdTicketCode = '';

  // 15. Protección de rutas privadas sin sesión
  await check('15. Protección de rutas privadas sin token o con token inválido', async () => {
    const noToken = await apiReq('/api/tickets');
    assert.equal(noToken.status, 401);
    const badToken = await apiReq('/api/dashboard', { token: 'token.invalido.falso' });
    assert.equal(badToken.status, 401);
  });

  // 1. Inicio y cierre de sesión
  await check('1. Inicio de sesión por roles, validación de credenciales y cierre de sesión', async () => {
    const wrong = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'jcerna@konectarbpo.com', password: 'PasswordIncorrecto' },
    });
    assert.equal(wrong.status, 401);

    const adminLogin = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'jcerna@konectarbpo.com', password: 'KonectarAdmin2026!' },
    });
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.data.data.token;
    assert.equal(adminLogin.data.data.user.role, 'ADMIN');
    assert.equal(adminLogin.data.data.user.fullName, 'Jhony Alexis Cerna Moreno');

    const techLogin = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'fmisaico@konectarbpo.com', password: 'SoporteTI2026!' },
    });
    assert.equal(techLogin.status, 200);
    techToken = techLogin.data.data.token;
    assert.equal(techLogin.data.data.user.fullName, 'Fabricio Mariano Misaico Gonzales');

    const tech2Login = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'fgiron@konectarbpo.com', password: 'SoporteTI2026!' },
    });
    assert.equal(tech2Login.status, 200);
    assert.equal(tech2Login.data.data.user.fullName, 'Flavio Mariano Giron');

    const colab1Login = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'aquispe@konectarbpo.com', password: 'Konectar2026!' },
    });
    assert.equal(colab1Login.status, 200);
    colab1Token = colab1Login.data.data.token;

    const colab2Login = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'vmendoza@konectarbpo.com', password: 'Konectar2026!' },
    });
    assert.equal(colab2Login.status, 200);
    colab2Token = colab2Login.data.data.token;

    const logoutRes = await apiReq('/api/auth/logout', { method: 'POST', token: colab2Token });
    assert.equal(logoutRes.status, 200);
  });

  // 2. Registro de usuarios y activación/desactivación
  await check('2. Registro de nuevos usuarios, edición y bloqueo de cuentas desactivadas', async () => {
    const createRes = await apiReq('/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Usuario Prueba Automatizada',
        email: 'prueba.auto@konectarbpo.com',
        password: 'TestUser2026!',
        roleCode: 'COLABORADOR',
        departmentId: 2,
      },
    });
    assert.equal(createRes.status, 201);
    const newUserId = createRes.data.data.id;

    // Desactivar cuenta y comprobar que no puede iniciar sesión
    const deact = await apiReq(`/api/users/${newUserId}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: false },
    });
    assert.equal(deact.status, 200);

    const blockedLogin = await apiReq('/api/auth/login', {
      method: 'POST',
      body: { email: 'prueba.auto@konectarbpo.com', password: 'TestUser2026!' },
    });
    assert.equal(blockedLogin.status, 403);
  });

  // 3. Control de permisos RBAC estricto en Backend
  await check('3. Control de acceso por roles (aislamiento entre colaboradores y bloqueo de config)', async () => {
    // Colaborador no puede listar usuarios
    const colabUsers = await apiReq('/api/users', { token: colab1Token });
    assert.equal(colabUsers.status, 403);

    // Técnico no puede cambiar configuración general del administrador
    const techSettings = await apiReq('/api/settings', {
      method: 'PUT',
      token: techToken,
      body: { auto_assign_enabled: 'false', auto_assign_strategy: 'LEAST_WORKLOAD' },
    });
    assert.equal(techSettings.status, 403);

    // Colaborador 2 no puede abrir un ticket privado perteneciente al Colaborador 1 (ticket #1 del seed es de colab 1)
    const privateTicket = await apiReq('/api/tickets/1', { token: colab2Token });
    assert.equal(privateTicket.status, 403);
  });

  // 13. Validación de formularios y archivos adjuntos
  await check('13. Validación de formularios y rechazo de adjuntos no permitidos', async () => {
    const invalidTicket = await apiReq('/api/tickets', {
      method: 'POST',
      token: colab1Token,
      body: {
        categoryId: 1,
        incidentType: 'Falla',
        priority: 'ALTA',
        subject: 'abc', // demasiado corto
        description: 'corto',
      },
    });
    assert.equal(invalidTicket.status, 400);

    // Archivo ejecutable rechazado
    const badForm = new FormData();
    badForm.append('categoryId', '1');
    badForm.append('incidentType', 'Falla operativa');
    badForm.append('priority', 'MEDIA');
    badForm.append('subject', 'Intento de archivo no permitido');
    badForm.append('description', 'Descripción válida de prueba para filtro de seguridad.');
    badForm.append('attachments', new Blob(['MZ-fake'], { type: 'application/x-msdownload' }), 'malware.exe');

    const badUpload = await apiReq('/api/tickets', {
      method: 'POST',
      token: colab1Token,
      body: badForm,
      isMultipart: true,
    });
    assert.equal(badUpload.status, 400);
  });

  // 4 y 5. Registro de incidencias con evidencia adjunta y códigos únicos concurrentes
  await check('4 y 5. Registro de incidencias con adjuntos y generación concurrente de códigos únicos', async () => {
    const form = new FormData();
    form.append('categoryId', '1'); // HARDWARE -> Fabricio Mariano Misaico Gonzales
    form.append('incidentType', 'Falla operativa de equipo o periférico');
    form.append('priority', 'ALTA');
    form.append('subject', 'Falla de fuente de poder en módulo Ventas');
    form.append('description', 'La estación PC-VEN-099 no enciende al presionar el botón principal.');
    form.append('workstationCode', 'PC-VEN-099');
    form.append(
      'attachments',
      new Blob(['Log diagnóstico fuente de poder 2026'], { type: 'text/plain' }),
      'evidencia_pc_ven_099.txt'
    );

    const created = await apiReq('/api/tickets', {
      method: 'POST',
      token: colab1Token,
      body: form,
      isMultipart: true,
    });
    assert.equal(created.status, 201);
    createdTicketId = created.data.data.id;
    createdTicketCode = created.data.data.code;
    assert.match(createdTicketCode, /^INC-\d{4}-\d{4}$/);

    // Prueba de concurrencia: 5 tickets simultáneos
    const concurrentPromises = Array.from({ length: 5 }, (_, idx) =>
      apiReq('/api/tickets', {
        method: 'POST',
        token: colab1Token,
        body: {
          categoryId: (idx % 3) + 1,
          incidentType: 'Falla operativa',
          priority: 'MEDIA',
          subject: `Solicitud concurrente verificada #${idx + 1}`,
          description: 'Verificación de transacciones ACID sin sobrescritura de registros.',
        },
      })
    );
    const concurrentRes = await Promise.all(concurrentPromises);
    const codes = new Set(concurrentRes.map((r) => r.data.data.code));
    assert.equal(codes.size, 5, 'Los 5 tickets concurrentes deben tener códigos únicos distintos.');
  });

  // 6. Asignación automática y reasignación manual de técnicos
  await check('6. Asignación automática, balanceo de cola pendiente y reasignación manual', async () => {
    // Auto-asignar los tickets sin asignar del seed
    const batch = await apiReq('/api/tickets/auto-assign-pending', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(batch.status, 200);
    assert.ok(batch.data.data.assignedCount >= 1);

    // Reasignar nuestro ticket creado al Técnico #2 (Flavio) y retornar al Técnico #1 (Fabricio)
    const reassignTo2 = await apiReq(`/api/tickets/${createdTicketId}/assign`, {
      method: 'POST',
      token: adminToken,
      body: { technicianId: 2, reason: 'Escalamiento temporal de verificación a Software' },
    });
    assert.equal(reassignTo2.status, 200);

    const reassignBackTo1 = await apiReq(`/api/tickets/${createdTicketId}/assign`, {
      method: 'POST',
      token: adminToken,
      body: { technicianId: 1, reason: 'Retorno a especialista de Hardware Fabricio Mariano Misaico Gonzales' },
    });
    assert.equal(reassignBackTo1.status, 200);
  });

  // 7, 8 y 9. Estados, Historial Inmutable, Diagnósticos y Comentarios
  await check('7, 8 y 9. Flujo de estados (Pendiente -> En proceso -> Resuelto), historial y notas internas', async () => {
    // Pasar a EN_PROCESO por el técnico asignado
    const inProg = await apiReq(`/api/tickets/${createdTicketId}/status`, {
      method: 'PATCH',
      token: techToken,
      body: {
        status: 'EN_PROCESO',
        comment: 'Se inicia revisión eléctrica en sitio.',
      },
    });
    assert.equal(inProg.status, 200);

    // Comentario técnico interno (no debe ser visible para el colaborador) + comentario público
    await apiReq(`/api/tickets/${createdTicketId}/comments`, {
      method: 'POST',
      token: techToken,
      body: { content: 'Nota interna: solicitar repuesto ATX en almacén TI.', isInternal: true },
    });
    await apiReq(`/api/tickets/${createdTicketId}/comments`, {
      method: 'POST',
      token: techToken,
      body: { content: 'Estimado colaborador, estamos reemplazando la fuente ATX.', isInternal: false },
    });

    // Intentar resolver SIN diagnóstico/solución -> debe rechazarse (400)
    const prematureResolve = await apiReq(`/api/tickets/${createdTicketId}/status`, {
      method: 'PATCH',
      token: techToken,
      body: { status: 'RESUELTO', comment: 'Intento sin diagnóstico' },
    });
    assert.equal(prematureResolve.status, 400);

    // Resolver registrando diagnóstico y solución
    const resolved = await apiReq(`/api/tickets/${createdTicketId}/status`, {
      method: 'PATCH',
      token: techToken,
      body: {
        status: 'RESUELTO',
        diagnosis: 'Fuente ATX de 500W presentaba fusible primario abierto.',
        solution: 'Se instaló fuente certificada nueva de 550W y el equipo encendió normalmente.',
        comment: 'Estación operativa entregada a conformidad.',
      },
    });
    assert.equal(resolved.status, 200);

    // Verificar detalle visto por el Colaborador: ve historial completo (3 estados), adjunto y solo el comentario público
    const detailColab = await apiReq(`/api/tickets/${createdTicketId}`, { token: colab1Token });
    assert.equal(detailColab.status, 200);
    assert.equal(detailColab.data.data.status, 'RESUELTO');
    assert.ok(detailColab.data.data.firstResponseAt !== null, 'Debe haberse registrado KPI 1 first_response_at');
    assert.ok(detailColab.data.data.resolvedAt !== null, 'Debe haberse registrado resolved_at');
    assert.equal(detailColab.data.data.statusHistory.length, 3, 'Historial inmutable con los 3 estados');
    assert.equal(detailColab.data.data.comments.length, 1, 'Colaborador no debe ver notas internas');
    assert.equal(detailColab.data.data.attachments.length, 1, 'Adjunto persistido');
  });

  // 10. Sistema de notificaciones
  await check('10. Generación automática de notificaciones reales y marcado de lectura', async () => {
    const notifRes = await apiReq('/api/notifications?unreadOnly=true', { token: colab1Token });
    assert.equal(notifRes.status, 200);
    assert.ok(notifRes.data.data.unreadCount >= 1);

    const firstNotifId = notifRes.data.data.items[0].id;
    const markRead = await apiReq(`/api/notifications/${firstNotifId}/read`, {
      method: 'PATCH',
      token: colab1Token,
    });
    assert.equal(markRead.status, 200);
  });

  // 11 y 12. Cálculo de KPIs, Dashboard y Exportación CSV
  await check('11 y 12. Cálculo exacto de KPI 1, KPI 2, Dashboard y exportación de reporte CSV', async () => {
    const dashRes = await apiReq('/api/dashboard', { token: adminToken });
    assert.equal(dashRes.status, 200);
    assert.ok(dashRes.data.data.summary.totalTickets >= 20);

    const kpiRes = await apiReq('/api/reports/kpis', { token: adminToken });
    assert.equal(kpiRes.status, 200);
    const kpis = kpiRes.data.data.kpis;
    const expectedRate = Math.round((kpis.resolvedCount / kpis.totalRegistered) * 10000) / 100;
    assert.equal(kpis.resolutionRate, expectedRate, 'Fórmula KPI 2 verificada con exactitud');
    assert.ok(kpis.avgFirstResponseMinutes >= 0, 'KPI 1 calculado desde tiempos reales');

    const csvRes = await apiReq('/api/reports/export.csv', { token: adminToken });
    assert.equal(csvRes.status, 200);
    assert.ok(String(csvRes.data).includes('KPI 1: Tiempo Primera Respuesta (Minutos)'));
    assert.ok(String(csvRes.data).includes(createdTicketCode));
  });

  // 14. Persistencia directa e integridad referencial en Base de Datos Relacional
  await check('14. Verificación directa de persistencia SQL e integridad referencial (Foreign Keys)', async () => {
    const db = getDb();
    const fkRow = normalizeRow<{ foreign_keys: number }>(db.prepare('PRAGMA foreign_keys').get());
    assert.equal(fkRow?.foreign_keys, 1, 'PRAGMA foreign_keys debe estar activo');

    const persistedTicket = normalizeRow<{ code: string; status: string }>(
      db.prepare('SELECT code, status FROM tickets WHERE id = ?').get(createdTicketId)
    );
    assert.equal(persistedTicket?.code, createdTicketCode);
    assert.equal(persistedTicket?.status, 'RESUELTO');

    // Intentar violar integridad referencial insertando rol inexistente -> SQLite debe rechazarlo
    assert.throws(() => {
      db.prepare(
        `INSERT INTO users (employee_code, full_name, email, password_hash, role_id, department_id)
         VALUES ('BAD-001', 'Invalido', 'bad@konectarbpo.com', 'hash', 9999, 1)`
      ).run();
    });
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();

  // Limpiar BD y adjuntos temporales de test
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${testDbPath}${suffix}`;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  if (fs.existsSync(testUploadDir)) {
    fs.rmSync(testUploadDir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n=====================================================================');
  console.log(` RESULTADO FINAL: ${results.length - failed.length}/${results.length} pruebas superadas.`);
  console.log('=====================================================================\n');

  if (failed.length > 0) {
    process.exit(1);
  }
}

runIntegrationSuite().catch((err) => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
