import fs from 'node:fs';
import { env } from '../config/env';
import { closeDb, getDb, normalizeRow, withTransaction } from './connection';
import { hashPasswordSync } from '../utils/password';
import { generateNextTicketCode } from '../utils/ticketCode';

function isoMinusMinutes(baseMs: number, minutesAgo: number): string {
  return new Date(baseMs - minutesAgo * 60 * 1000).toISOString();
}

export function seedDatabase(reset = false): void {
  let clearedInPlace = false;
  if (reset) {
    closeDb();
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const target = `${env.dbPath}${suffix}`;
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
      }
    } catch (err: any) {
      if (err?.code === 'EBUSY' || err?.code === 'EPERM') {
        clearedInPlace = true;
      } else {
        throw err;
      }
    }
  }

  const db = getDb();
  if (reset && clearedInPlace) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      withTransaction((tx) => {
        const tables = [
          'notifications',
          'audit_logs',
          'ticket_attachments',
          'ticket_comments',
          'ticket_status_history',
          'ticket_assignments',
          'tickets',
          'ticket_sequences',
          'system_settings',
          'technicians',
          'users',
          'categories',
          'departments',
          'roles',
        ];
        for (const t of tables) {
          tx.exec(`DELETE FROM ${t}`);
        }
        tx.exec(`DELETE FROM sqlite_sequence`);
      });
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  const existingRoles = normalizeRow<{ count: number }>(db.prepare('SELECT COUNT(*) AS count FROM roles').get());
  if (Number(existingRoles?.count || 0) > 0 && !reset) {
    return;
  }

  const baseNow = Date.now();
  const nowIso = new Date(baseNow).toISOString();

  const adminPass = hashPasswordSync('KonectarAdmin2026!');
  const techPass = hashPasswordSync('SoporteTI2026!');
  const colabPass = hashPasswordSync('Konectar2026!');

  withTransaction((tx) => {
    // 1. Roles del Sistema
    tx.prepare(`INSERT INTO roles (code, name, description) VALUES (?, ?, ?)`).run(
      'ADMIN',
      'Administrador TI',
      'Acceso integral a usuarios, asignaciones, incidencias, configuración y KPIs.'
    );
    tx.prepare(`INSERT INTO roles (code, name, description) VALUES (?, ?, ?)`).run(
      'TECNICO',
      'Técnico de Soporte TI',
      'Atención técnica de incidencias asignadas, registro de diagnósticos, soluciones y estados.'
    );
    tx.prepare(`INSERT INTO roles (code, name, description) VALUES (?, ?, ?)`).run(
      'COLABORADOR',
      'Colaborador Corporativo',
      'Registro de incidencias tecnológicas y seguimiento de sus solicitudes.'
    );

    const roleAdmin = Number(
      (tx.prepare(`SELECT id FROM roles WHERE code = 'ADMIN'`).get() as { id: number }).id
    );
    const roleTech = Number(
      (tx.prepare(`SELECT id FROM roles WHERE code = 'TECNICO'`).get() as { id: number }).id
    );
    const roleColab = Number(
      (tx.prepare(`SELECT id FROM roles WHERE code = 'COLABORADOR'`).get() as { id: number }).id
    );

    // 2. Departamentos organizacionales de KONECTAR BPO S.A.C. (Sede Lima Norte)
    const departmentsData = [
      ['SIS-TI', 'Soporte TI / Área de Sistemas'],
      ['VEN-BPO', 'Área de Ventas y Comercial'],
      ['BKD-OPE', 'Área de Backdata'],
      ['VAL-OPE', 'Área de Validación'],
      ['SEG-OPE', 'Área de Seguimiento'],
      ['OPE-GEN', 'Área de Operaciones'],
      ['RRHH', 'Área de Recursos Humanos'],
      ['FIN-GER', 'Gerencia Financiera'],
    ];

    const deptIds: Record<string, number> = {};
    for (const [code, name] of departmentsData) {
      const res = tx
        .prepare(`INSERT INTO departments (code, name, site, is_active) VALUES (?, ?, 'Sede Lima Norte', 1)`)
        .run(code, name);
      deptIds[code] = Number(res.lastInsertRowid);
    }

    // 3. Categorías principales de incidencias TI
    const categoriesData = [
      [
        'HARDWARE',
        'Hardware',
        'Fallas en estaciones de trabajo, diademas/headsets USB, monitores, teclados y periféricos.',
        15,
        120,
      ],
      [
        'SOFTWARE',
        'Software',
        'Incidencias en CRM corporativo, plataformas de validación, sistema operativo, ofimática y accesos.',
        15,
        90,
      ],
      [
        'CONECTIVIDAD',
        'Conectividad y redes',
        'Interrupciones de red LAN/WAN, fibra óptica, extensiones VoIP/softphone y VPN corporativa.',
        12,
        90,
      ],
    ] as const;

    const catIds: Record<string, number> = {};
    for (const [code, name, desc, slaResp, slaRes] of categoriesData) {
      const res = tx
        .prepare(
          `INSERT INTO categories (code, name, description, sla_response_minutes, sla_resolution_minutes, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`
        )
        .run(code, name, desc, slaResp, slaRes);
      catIds[code] = Number(res.lastInsertRowid);
    }

    // 4. Administrador del Área de Sistemas / Soporte TI
    const adminRes = tx
      .prepare(
        `INSERT INTO users (employee_code, full_name, email, password_hash, phone, role_id, department_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        'KON-ADM-001',
        'Jhony Alexis Cerna Moreno',
        'jcerna@konectarbpo.com',
        adminPass,
        '925816060',
        roleAdmin,
        deptIds['SIS-TI'],
        nowIso,
        nowIso
      );
    const adminUserId = Number(adminRes.lastInsertRowid);

    // Técnicos Oficiales de Soporte TI
    const techsSeed = [
      {
        code: 'KON-TEC-001',
        name: 'Fabricio Mariano Misaico Gonzales',
        email: 'fmisaico@konectarbpo.com',
        phone: '987-410-201',
        specialty: 'Especialista en Hardware, Periféricos y Red Física BPO',
        catCode: 'HARDWARE',
        level: 'N1',
        max: 10,
        available: 1,
      },
      {
        code: 'KON-TEC-002',
        name: 'Flavio Mariano Giron',
        email: 'fgiron@konectarbpo.com',
        phone: '987-410-202',
        specialty: 'Especialista en Software, Plataformas CRM, Accesos y VoIP',
        catCode: 'SOFTWARE',
        level: 'N2',
        max: 10,
        available: 1,
      },
    ];

    const techRecords: { techId: number; userId: number; name: string }[] = [];
    for (const t of techsSeed) {
      const uRes = tx
        .prepare(
          `INSERT INTO users (employee_code, full_name, email, password_hash, phone, role_id, department_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(t.code, t.name, t.email, techPass, t.phone, roleTech, deptIds['SIS-TI'], nowIso, nowIso);
      const uId = Number(uRes.lastInsertRowid);

      const tRes = tx
        .prepare(
          `INSERT INTO technicians (user_id, specialty, specialty_category_code, support_level, max_concurrent_tickets, is_available, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(uId, t.specialty, t.catCode, t.level, t.max, t.available, nowIso, nowIso);

      techRecords.push({ techId: Number(tRes.lastInsertRowid), userId: uId, name: t.name });
    }

    // Colaboradores Corporativos por Área Operativa
    const colabsSeed = [
      {
        code: 'KON-COL-001',
        name: 'Andrés Quispe Flores',
        email: 'aquispe@konectarbpo.com',
        phone: '984-310-101',
        dept: deptIds['VEN-BPO'],
      },
      {
        code: 'KON-COL-002',
        name: 'Valeria Mendoza Díaz',
        email: 'vmendoza@konectarbpo.com',
        phone: '984-310-102',
        dept: deptIds['BKD-OPE'],
      },
      {
        code: 'KON-COL-003',
        name: 'Renato Castro León',
        email: 'rcastro@konectarbpo.com',
        phone: '984-310-103',
        dept: deptIds['VAL-OPE'],
      },
      {
        code: 'KON-COL-004',
        name: 'Camila Rojas Medina',
        email: 'crojas@konectarbpo.com',
        phone: '984-310-104',
        dept: deptIds['SEG-OPE'],
      },
      {
        code: 'KON-COL-005',
        name: 'Jorge Huamán Ruiz',
        email: 'jhuaman@konectarbpo.com',
        phone: '984-310-105',
        dept: deptIds['RRHH'],
      },
    ];

    const colabRecords: { userId: number; deptId: number; name: string }[] = [];
    for (const c of colabsSeed) {
      const uRes = tx
        .prepare(
          `INSERT INTO users (employee_code, full_name, email, password_hash, phone, role_id, department_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(c.code, c.name, c.email, colabPass, c.phone, roleColab, c.dept, nowIso, nowIso);
      colabRecords.push({ userId: Number(uRes.lastInsertRowid), deptId: c.dept, name: c.name });
    }

    // 5. Configuración general operativa
    const settingsSeed = [
      [
        'auto_assign_enabled',
        'true',
        'Activa la distribución automática de nuevos tickets según disponibilidad y carga de técnicos.',
      ],
      [
        'auto_assign_strategy',
        'SPECIALTY_AND_WORKLOAD',
        'Estrategia de asignación: prioriza especialidad por categoría y menor carga activa.',
      ],
      ['company_site_name', 'KONECTAR BPO S.A.C. - Sede Lima Norte', 'Nombre institucional de la sede operativa.'],
      ['support_email', 'soporte.ti@konectarbpo.com', 'Correo interno de contacto del área de Soporte TI.'],
    ];

    for (const [k, v, desc] of settingsSeed) {
      tx.prepare(
        `INSERT INTO system_settings (key, value, description, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(k, v, desc, adminUserId, nowIso);
    }

    // 6. Historial operativo de incidencias de KONECTAR BPO S.A.C.
    interface SeedTicketSpec {
      colabIdx: number;
      cat: 'HARDWARE' | 'SOFTWARE' | 'CONECTIVIDAD';
      type: string;
      priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
      subject: string;
      description: string;
      workstation: string;
      techIdx: number | null; // 0 = Fabricio (Hardware), 1 = Flavio (Software)
      status: 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO';
      createdMinsAgo: number;
      firstRespDelayMins: number | null;
      resolvedDelayMins: number | null;
      diagnosis?: string;
      solution?: string;
      comment?: string;
    }

    const initialTickets: SeedTicketSpec[] = [
      {
        colabIdx: 0,
        cat: 'HARDWARE',
        type: 'Diadema / Headset sin audio o micrófono',
        priority: 'ALTA',
        subject: 'Diadema USB sin retorno de micrófono en módulo de Ventas',
        description:
          'Durante llamadas de cierre comercial el cliente no escucha al asesor. Ya se probó cambiar de puerto USB frontal y persiste la falla.',
        workstation: 'PC-VEN-014',
        techIdx: 0,
        status: 'RESUELTO',
        createdMinsAgo: 12960,
        firstRespDelayMins: 8,
        resolvedDelayMins: 34,
        diagnosis:
          'Conector interno del brazo de micrófono en headset Plantronics presentaba falso contacto por desgaste físico.',
        solution:
          'Se reemplazó la diadema por unidad operativa de stock TI (Serie PLT-8841) y se validó audio en prueba de eco VoIP.',
        comment: 'Audio validado correctamente para retomar campaña.',
      },
      {
        colabIdx: 1,
        cat: 'SOFTWARE',
        type: 'Acceso, credenciales y cuentas de usuario',
        priority: 'ALTA',
        subject: 'Bloqueo de sesión concurrente en plataforma CRM corporativa',
        description:
          'El sistema CRM muestra mensaje de sesión activa bloqueada tras reinicio inesperado del navegador y no permite registrar gestiones de Backdata.',
        workstation: 'PC-BKD-006',
        techIdx: 1,
        status: 'RESUELTO',
        createdMinsAgo: 11520,
        firstRespDelayMins: 6,
        resolvedDelayMins: 19,
        diagnosis: 'Token huérfano retenido en caché de sesión del servidor CRM tras cierre abrupto.',
        solution:
          'Se liberó la sesión activa desde consola administrativa CRM, se limpió caché del navegador y se verificó ingreso.',
      },
      {
        colabIdx: 2,
        cat: 'CONECTIVIDAD',
        type: 'Falla en extensión VoIP / Softphone SIP',
        priority: 'CRITICA',
        subject: 'Pérdida de registro en extensión VoIP 4108 de Validación',
        description:
          'El softphone corporativo arroja error SIP 408 Request Timeout impidiendo realizar llamadas de validación de ventas.',
        workstation: 'PC-VAL-003',
        techIdx: 1,
        status: 'RESUELTO',
        createdMinsAgo: 10080,
        firstRespDelayMins: 5,
        resolvedDelayMins: 28,
        diagnosis: 'Perfil SIP desincronizado y concesión de red voz vencida tras corte eléctrico breve.',
        solution:
          'Se recargaron credenciales SIP en softphone, se renovó concesión DHCP de voz y la extensión 4108 quedó registrada en línea.',
      },
      {
        colabIdx: 3,
        cat: 'SOFTWARE',
        type: 'Instalación o actualización de software homologado',
        priority: 'MEDIA',
        subject: 'Instalación de visor PDF y certificados para actas de Seguimiento',
        description:
          'Se solicita configurar lector de documentos firmados digitalmente para revisar expedientes diarios del área de Seguimiento.',
        workstation: 'PC-SEG-009',
        techIdx: 1,
        status: 'RESUELTO',
        createdMinsAgo: 8640,
        firstRespDelayMins: 14,
        resolvedDelayMins: 46,
        diagnosis: 'Estación nueva no contaba con paquete corporativo estándar de lectura y cadena de certificados raíz.',
        solution:
          'Se desplegó paquete corporativo homologado e importaron certificados internos verificando apertura de formatos.',
      },
      {
        colabIdx: 4,
        cat: 'HARDWARE',
        type: 'Reemplazo de teclado o mouse',
        priority: 'BAJA',
        subject: 'Teclado con teclas numéricas trabadas en puesto de Recursos Humanos',
        description:
          'El bloque numérico del teclado responde con doble pulsación dificultando el ingreso de códigos internos.',
        workstation: 'PC-RRHH-002',
        techIdx: 0,
        status: 'RESUELTO',
        createdMinsAgo: 7200,
        firstRespDelayMins: 15,
        resolvedDelayMins: 42,
        diagnosis: 'Desgaste en membrana del pad numérico por uso continuo.',
        solution: 'Se efectuó cambio por teclado USB corporativo nuevo y baja de periférico averiado.',
      },
      {
        colabIdx: 0,
        cat: 'CONECTIVIDAD',
        type: 'Degradación o latencia de Internet / Fibra',
        priority: 'ALTA',
        subject: 'Latencia elevada al cargar formularios web de cobertura de fibra óptica',
        description:
          'En la isla 2 de Ventas las páginas de consulta de cobertura tardan más de 25 segundos en responder.',
        workstation: 'PC-VEN-019',
        techIdx: 1,
        status: 'RESUELTO',
        createdMinsAgo: 5760,
        firstRespDelayMins: 9,
        resolvedDelayMins: 38,
        diagnosis: 'Resolución DNS secundaria apuntando a servidor externo con saturación.',
        solution:
          'Se actualizaron parámetros DNS internos en la subred de Ventas reduciendo el tiempo de carga a menos de 2 segundos.',
      },
      {
        colabIdx: 1,
        cat: 'HARDWARE',
        type: 'Falla de monitor o señal de video',
        priority: 'MEDIA',
        subject: 'Segundo monitor parpadea y pierde señal HDMI en Backdata',
        description:
          'La pantalla extendida se apaga cada 10 minutos afectando el cruce de bases de datos operativas.',
        workstation: 'PC-BKD-011',
        techIdx: 0,
        status: 'RESUELTO',
        createdMinsAgo: 4320,
        firstRespDelayMins: 11,
        resolvedDelayMins: 35,
        diagnosis: 'Cable HDMI con blindaje deteriorado generando pérdida de sincronía a 1080p.',
        solution: 'Se sustituyó cable HDMI blindado de 1.8m y se ajustó frecuencia de refresco a 60Hz estables.',
      },
      {
        colabIdx: 2,
        cat: 'SOFTWARE',
        type: 'Error en aplicativo interno (Validación / Backdata)',
        priority: 'ALTA',
        subject: 'Error de permisos al exportar matriz diaria en sistema de Validación',
        description:
          'Al presionar exportar reporte operativo aparece error 403 de perfil incompleto en el aplicativo interno.',
        workstation: 'PC-VAL-007',
        techIdx: 1,
        status: 'RESUELTO',
        createdMinsAgo: 2880,
        firstRespDelayMins: 10,
        resolvedDelayMins: 27,
        diagnosis: 'Grupo de seguridad de validación había perdido permiso de lectura de plantillas tras actualización.',
        solution: 'Se restauró rol operativo en directorio de aplicación y el colaborador exportó sin inconvenientes.',
      },
      {
        colabIdx: 3,
        cat: 'CONECTIVIDAD',
        type: 'Interrupción de red cableada LAN',
        priority: 'ALTA',
        subject: 'Desconexión intermitente de red cableada en módulo Seguimiento',
        description:
          'El ícono de Ethernet pasa a sin conexión durante unos segundos cada hora cortando la sesión del CRM.',
        workstation: 'PC-SEG-004',
        techIdx: 0,
        status: 'RESUELTO',
        createdMinsAgo: 1800,
        firstRespDelayMins: 7,
        resolvedDelayMins: 31,
        diagnosis: 'Patch cord Cat6 en punto de red P-22 tenía clip RJ45 roto provocando desconexión ante vibraciones.',
        solution: 'Se cambió patch cord certificado Cat6 y se certificó enlace Gigabit estable sin pérdida de paquetes.',
      },
      {
        colabIdx: 0,
        cat: 'SOFTWARE',
        type: 'Bloqueo o falla en CRM corporativo',
        priority: 'CRITICA',
        subject: 'Cierre inesperado de navegador al abrir ficha omnicanal de redes sociales',
        description:
          'Cada vez que ingresa un chat de campaña telecomunicaciones, el navegador se cierra automáticamente.',
        workstation: 'PC-VEN-008',
        techIdx: 1,
        status: 'EN_PROCESO',
        createdMinsAgo: 240,
        firstRespDelayMins: 9,
        resolvedDelayMins: null,
        diagnosis:
          'Conflicto detectado con extensión antigua de captura y exceso de consumo de memoria en perfil local.',
        comment: 'Se está regenerando el perfil limpio del navegador y validando estabilidad en llamadas de prueba.',
      },
      {
        colabIdx: 2,
        cat: 'HARDWARE',
        type: 'Mantenimiento correctivo / sobrecalentamiento',
        priority: 'ALTA',
        subject: 'Equipo presenta sobrecalentamiento y apagado súbito en Validación',
        description:
          'La estación de trabajo emite ruido fuerte en ventilador y se apagó dos veces durante la mañana.',
        workstation: 'PC-VAL-012',
        techIdx: 0,
        status: 'EN_PROCESO',
        createdMinsAgo: 150,
        firstRespDelayMins: 12,
        resolvedDelayMins: null,
        diagnosis: 'Obstrucción de disipador de procesador y pasta térmica seca (temperatura medida: 91°C).',
        comment: 'Se habilitó estación de contingencia al colaborador mientras se ejecuta mantenimiento térmico en taller TI.',
      },
      {
        colabIdx: 4,
        cat: 'SOFTWARE',
        type: 'Requerimiento de configuración de estación',
        priority: 'MEDIA',
        subject: 'Configuración de acceso a carpeta compartida de red en Recursos Humanos',
        description:
          'Se requiere mapeo de unidad de red interna para almacenamiento de formatos operativos del mes.',
        workstation: 'PC-RRHH-004',
        techIdx: 1,
        status: 'PENDIENTE',
        createdMinsAgo: 75,
        firstRespDelayMins: null,
        resolvedDelayMins: null,
      },
      {
        colabIdx: 1,
        cat: 'HARDWARE',
        type: 'Reemplazo de teclado o mouse',
        priority: 'ALTA',
        subject: 'Mouse óptico sin respuesta en estación de Backdata',
        description:
          'El puntero quedó inmóvil pese a reconectar en distintos puertos USB tras el inicio de turno.',
        workstation: 'PC-BKD-015',
        techIdx: null,
        status: 'PENDIENTE',
        createdMinsAgo: 35,
        firstRespDelayMins: null,
        resolvedDelayMins: null,
      },
      {
        colabIdx: 3,
        cat: 'CONECTIVIDAD',
        type: 'Falla en extensión VoIP / Softphone SIP',
        priority: 'CRITICA',
        subject: 'Anexo VoIP 4215 sin tono de marcación saliente en Seguimiento',
        description:
          'No permite emitir llamadas de seguimiento a clientes; muestra error de troncal ocupada en pantalla.',
        workstation: 'PC-SEG-012',
        techIdx: null,
        status: 'PENDIENTE',
        createdMinsAgo: 18,
        firstRespDelayMins: null,
        resolvedDelayMins: null,
      },
    ];

    for (const item of initialTickets) {
      const createdAt = isoMinusMinutes(baseNow, item.createdMinsAgo);
      const firstRespAt =
        item.firstRespDelayMins !== null
          ? isoMinusMinutes(baseNow, item.createdMinsAgo - item.firstRespDelayMins)
          : null;
      const resolvedAt =
        item.resolvedDelayMins !== null
          ? isoMinusMinutes(baseNow, item.createdMinsAgo - item.resolvedDelayMins)
          : null;
      const updatedAt = resolvedAt || firstRespAt || createdAt;

      const colab = colabRecords[item.colabIdx];
      const tech = item.techIdx !== null ? techRecords[item.techIdx] : null;
      const code = generateNextTicketCode(tx, createdAt);

      const ins = tx
        .prepare(
          `INSERT INTO tickets (
             code, reporter_id, department_id, category_id, incident_type, priority,
             subject, description, workstation_code, assigned_technician_id, status,
             diagnosis, solution, first_response_at, resolved_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          colab.userId,
          colab.deptId,
          catIds[item.cat],
          item.type,
          item.priority,
          item.subject,
          item.description,
          item.workstation,
          tech ? tech.techId : null,
          item.status,
          item.diagnosis || null,
          item.solution || null,
          firstRespAt,
          resolvedAt,
          createdAt,
          updatedAt
        );

      const ticketId = Number(ins.lastInsertRowid);

      tx.prepare(
        `INSERT INTO ticket_status_history (ticket_id, previous_status, new_status, changed_by_user_id, comment, created_at)
         VALUES (?, NULL, 'PENDIENTE', ?, ?, ?)`
      ).run(
        ticketId,
        colab.userId,
        tech
          ? `Incidencia registrada y asignada automáticamente a ${tech.name}.`
          : 'Incidencia registrada en espera de asignación de técnico.',
        createdAt
      );

      if (tech) {
        tx.prepare(
          `INSERT INTO ticket_assignments (ticket_id, previous_technician_id, technician_id, assigned_by_user_id, assignment_mode, reason, created_at)
           VALUES (?, NULL, ?, NULL, 'AUTOMATICA', 'Asignación inteligente por especialidad y balance de carga.', ?)`
        ).run(ticketId, tech.techId, createdAt);

        tx.prepare(`UPDATE technicians SET last_assigned_at = ?, updated_at = ? WHERE id = ?`).run(
          createdAt,
          createdAt,
          tech.techId
        );
      }

      if (item.status === 'EN_PROCESO' || item.status === 'RESUELTO') {
        const stepTime = firstRespAt || createdAt;
        tx.prepare(
          `INSERT INTO ticket_status_history (ticket_id, previous_status, new_status, changed_by_user_id, comment, created_at)
           VALUES (?, 'PENDIENTE', 'EN_PROCESO', ?, ?, ?)`
        ).run(
          ticketId,
          tech ? tech.userId : adminUserId,
          'Se inició revisión técnica y diagnóstico de la estación reportada.',
          stepTime
        );
      }

      if (item.status === 'RESUELTO' && resolvedAt) {
        tx.prepare(
          `INSERT INTO ticket_status_history (ticket_id, previous_status, new_status, changed_by_user_id, comment, created_at)
           VALUES (?, 'EN_PROCESO', 'RESUELTO', ?, ?, ?)`
        ).run(
          ticketId,
          tech ? tech.userId : adminUserId,
          `Atención culminada satisfactoriamente. ${item.solution || ''}`,
          resolvedAt
        );
      }

      if (item.comment && tech) {
        tx.prepare(
          `INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
           VALUES (?, ?, ?, 0, ?)`
        ).run(ticketId, tech.userId, item.comment, updatedAt);
      }

      if (item.status === 'PENDIENTE' && !tech) {
        tx.prepare(
          `INSERT INTO notifications (user_id, ticket_id, event_type, title, message, is_read, created_at)
           VALUES (?, ?, 'NUEVA_INCIDENCIA', ?, ?, 0, ?)`
        ).run(
          adminUserId,
          ticketId,
          `Incidencia pendiente de asignación: ${code}`,
          `${colab.name} registró "${item.subject}" (${item.priority}).`,
          createdAt
        );
      } else if (item.status === 'EN_PROCESO' && tech) {
        tx.prepare(
          `INSERT INTO notifications (user_id, ticket_id, event_type, title, message, is_read, created_at)
           VALUES (?, ?, 'INCIDENCIA_INICIADA', ?, ?, 0, ?)`
        ).run(
          colab.userId,
          ticketId,
          `Su ticket ${code} está en atención`,
          `${tech.name} se encuentra trabajando en la solución de su incidencia.`,
          firstRespAt || createdAt
        );
        tx.prepare(
          `INSERT INTO notifications (user_id, ticket_id, event_type, title, message, is_read, created_at)
           VALUES (?, ?, 'TICKET_ASIGNADO', ?, ?, 0, ?)`
        ).run(
          tech.userId,
          ticketId,
          `Ticket en curso asignado: ${code}`,
          `Recuerde documentar la solución final para "${item.subject}".`,
          createdAt
        );
      } else if (item.status === 'RESUELTO' && resolvedAt) {
        tx.prepare(
          `INSERT INTO notifications (user_id, ticket_id, event_type, title, message, is_read, created_at)
           VALUES (?, ?, 'INCIDENCIA_RESUELTA', ?, ?, 0, ?)`
        ).run(
          colab.userId,
          ticketId,
          `Incidencia resuelta: ${code}`,
          `Su requerimiento "${item.subject}" fue solucionado por Soporte TI.`,
          resolvedAt
        );
      }
    }

    tx.prepare(
      `INSERT INTO audit_logs (user_id, action, entity, details, ip_address, created_at)
       VALUES (?, 'SYSTEM_INIT', 'system', ?, '127.0.0.1', ?)`
    ).run(
      adminUserId,
      JSON.stringify({ message: 'Inicialización operativa de KONECTAR BPO S.A.C. - Sede Lima Norte' }),
      nowIso
    );
  });
}

if (require.main === module) {
  const shouldReset = process.argv.includes('--reset');
  seedDatabase(shouldReset);
  console.log(
    `[DB] Base de datos KONECTAR BPO S.A.C. inicializada correctamente (${shouldReset ? 'reinicio completo' : 'verificación'}).`
  );
}
