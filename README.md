# Sistema Web para la Optimización de la Gestión y Seguimiento de Incidencias en el Área de Soporte TI

**Empresa:** KONECTAR BPO S.A.C. (Sede Lima Norte — RUC N.° 20609998947)  
**Área:** Soporte TI / Área de Sistemas  
**Proyecto Académico:** Informe de Práctica Preprofesional II — Ingeniería de Sistemas (UCV)

Plataforma empresarial Full Stack de Mesa de Ayuda (**Help Desk / ITSM**) diseñada para centralizar el registro formal de incidencias tecnológicas (**Hardware**, **Software** y **Conectividad y redes**), automatizar y balancear la asignación de especialistas, auditar en tiempo real la trazabilidad de estados (**Pendiente**, **En proceso**, **Resuelto**) y calcular automáticamente los indicadores clave de rendimiento (**KPI 1: Tiempo de Primera Respuesta** y **KPI 2: Tasa de Resolución**).

---

## 1. Tecnologías Utilizadas

| Capa | Tecnologías |
|---|---|
| **Frontend** | React 18, TypeScript 5, Vite 6, Tailwind CSS 3, React Router v6, Recharts (gráficos analíticos), Lucide Icons |
| **Backend** | Node.js (v22.5+ / v24), Express 4, TypeScript 5, Zod (validación de esquemas), Multer (validación de evidencias adjuntas), Helmet, CORS |
| **Seguridad** | Autenticación JWT (`jsonwebtoken`), hash criptográfico de contraseñas (`bcryptjs`), control estricto de acceso basado en roles (**RBAC**) en frontend y backend, consultas SQL parametrizadas (protección contra SQL Injection) y bitácora de auditoría |
| **Base de Datos** | Motor Relacional **SQLite3 RDBMS** (`node:sqlite`) con `PRAGMA foreign_keys = ON`, concurrencia `WAL` y transacciones `ACID` (`BEGIN IMMEDIATE`) — listo para ejecutar localmente sin requerir servicios externos |

---

## 2. Estructura de Carpetas del Proyecto

```text
PROYECTO-PP2/
├── package.json                  # Scripts globales (dev, build, start, seed, test)
├── .env.example                  # Plantilla de variables de entorno
├── README.md                     # Guía general de instalación, ejecución y cuentas corporativas
├── docs/
│   ├── DOCUMENTACION_TECNICA_KONECTAR_ITSM.pdf   # Manual Técnico PDF completo (19 págs. con todos los diagramas)
│   ├── DOCUMENTACION_TECNICA_KONECTAR_ITSM.html  # Fuente vectorial imprimible de la documentación técnica
│   └── ARQUITECTURA_Y_BD.md                      # Resumen rápido en Markdown de Arquitectura, ER y API
├── backend/
│   ├── .env                      # Variables de entorno locales del servidor API
│   ├── data/                     # Base de datos relacional persistente (konectar_itsm.sqlite)
│   ├── uploads/                  # Almacenamiento seguro de archivos adjuntos de tickets
│   └── src/
│       ├── config/               # Configuración tipada de entorno
│       ├── controllers/          # Lógica de los 8 módulos (Auth, Users, Technicians, Tickets, Dashboard, Reports, Notifications, Settings)
│       ├── database/             # Conexión ACID (connection.ts), DDL 3FN (schema.sql) e inicialización operativa (seed.ts)
│       ├── middlewares/          # Autenticación JWT/RBAC, subida de archivos y manejo centralizado de errores
│       ├── routes/               # Enrutador modular REST (/api/*)
│       ├── services/             # Motor de asignación inteligente, notificaciones reales y auditoría
│       ├── utils/                # Hash bcrypt, tokens JWT y generador atómico de códigos INC-YYYY-NNNN
│       └── tests/                # Suite automatizada de pruebas integrales (15 validaciones E2E)
└── frontend/
    └── src/
        ├── components/           # Layout corporativo (Sidebar, Header, Campana viva) y componentes UI
        ├── context/              # Gestión global de sesión (AuthContext) y alertas (ToastContext)
        ├── pages/                # Vistas completas de los 8 módulos + Historial de Soluciones y Perfil
        ├── services/             # Cliente HTTP con interceptor Bearer JWT y descarga de blobs/CSV
        ├── types/                # Contratos TypeScript compartidos
        └── utils/                # Formateadores de fechas, tiempos SLA y tamaños de archivo
```

---

## 3. Requisitos e Instalación

### Requisitos Previos
- **Node.js v22.5.0 o superior** (verificado en **Node.js v24.18.0** y **npm 11.16.0**).
- No requiere instalar servidores externos de base de datos; el motor relacional SQLite crea e inicializa automáticamente el archivo `backend/data/konectar_itsm.sqlite`.

### Instalación de Dependencias (si se clona en otro equipo)
Desde la carpeta raíz `PROYECTO-PP2`:
```powershell
npm run install:all
```

### Variables de Entorno (`backend/.env`)
Ya preconfiguradas para ejecución inmediata (ver `.env.example`):
```env
NODE_ENV=development
PORT=4000
JWT_SECRET=konectar_bpo_itsm_sede_lima_norte_jwt_secret_2026_secure
JWT_EXPIRES_IN=12h
DB_PATH=./data/konectar_itsm.sqlite
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=5
CORS_ORIGIN=http://localhost:5173
```

---

## 4. Inicialización de Base de Datos y Ejecución del Sistema

### Reiniciar Base de Datos Operativa (Opcional)
Al iniciar el backend, si la base de datos no existe se crea e inicializa automáticamente. Si desea restaurar la base de datos operativa desde cero en cualquier momento:
```powershell
npm --prefix backend run seed:reset
```

### Opción A: Ejecución en Modo Desarrollo (Frontend + Backend simultáneos)
Desde la raíz `PROYECTO-PP2`:
```powershell
npm run dev
```
- **Interfaz Web (Frontend):** http://localhost:5173
- **API REST (Backend):** http://localhost:4000/api/health

### Opción B: Ejecución Unificada en Modo Producción
Compila ambos proyectos y sirve tanto la aplicación web como la API desde el puerto `4000`:
```powershell
npm run build
npm start
```
- **Aplicación Unificada:** http://localhost:4000

---

## 5. Cuentas Corporativas Configuradas (KONECTAR BPO S.A.C.)

| Perfil / Rol | Código | Responsable / Colaborador | Correo Corporativo | Contraseña | Área / Especialidad |
|---|---|---|---|---|---|
| **Administrador TI** | `KON-ADM-001` | **Jhony Alexis Cerna Moreno** | `jcerna@konectarbpo.com` | `KonectarAdmin2026!` | Soporte TI / Acceso Total |
| **Técnico de Hardware (N1)** | `KON-TEC-001` | **Fabricio Mariano Misaico Gonzales** | `fmisaico@konectarbpo.com` | `SoporteTI2026!` | Especialista en Hardware, Periféricos y Red Física BPO |
| **Técnico de Software (N2)** | `KON-TEC-002` | **Flavio Mariano Giron** | `fgiron@konectarbpo.com` | `SoporteTI2026!` | Especialista en Software, Plataformas CRM, Accesos y VoIP |
| **Colaborador** | `KON-COL-001` | Andrés Quispe Flores | `aquispe@konectarbpo.com` | `Konectar2026!` | Área de Ventas y Comercial |
| **Colaborador** | `KON-COL-002` | Valeria Mendoza Díaz | `vmendoza@konectarbpo.com` | `Konectar2026!` | Área de Backdata |
| **Colaborador** | `KON-COL-003` | Renato Castro León | `rcastro@konectarbpo.com` | `Konectar2026!` | Área de Validación |
| **Colaborador** | `KON-COL-004` | Camila Rojas Medina | `crojas@konectarbpo.com` | `Konectar2026!` | Área de Seguimiento |
| **Colaborador** | `KON-COL-005` | Jorge Huamán Ruiz | `jhuaman@konectarbpo.com` | `Konectar2026!` | Área de Recursos Humanos |

### Gestión de Contraseñas
1. **Desde el propio usuario:** Ingrese al menú lateral **Mi Perfil y Seguridad** (`/perfil`) → sección **Actualizar Contraseña de Acceso**.
2. **Como Administrador TI:** Ingrese a **Usuarios y Técnicos** (`/usuarios`) → haga clic en **Editar** sobre cualquier usuario e ingrese una nueva contraseña.

---

## 6. Ejecución de Pruebas Automatizadas (Validación Integral)

El proyecto incluye una suite de pruebas automatizadas (`backend/src/tests/integration.test.ts`) que levanta una instancia aislada de la API y base de datos para verificar los **15 puntos críticos del sistema** (login, bloqueo de cuentas inactivas, aislamiento RBAC entre colaboradores, subida y filtro de seguridad de adjuntos, concurrencia de códigos `INC-YYYY-NNNN`, balanceo y reasignación de técnicos, flujo inmutable de estados, notas internas, notificaciones reales, exactitud matemática de KPI 1 y KPI 2, exportación CSV e integridad referencial `FOREIGN KEY`):

```powershell
npm test
```

---

## 7. Módulos Incluidos

1. **Módulo 1 — Autenticación, Roles y Usuarios:** Login JWT, protección de rutas, gestión completa de cuentas, roles (`ADMIN`, `TECNICO`, `COLABORADOR`) y activación/desactivación.
2. **Módulo 2 — Registro Estructurado de Incidencias:** Generación correlativa automática (`INC-2026-XXXX`), 3 categorías principales (*Hardware*, *Software*, *Conectividad y redes*), prioridad, código de estación BPO y carga validada de evidencias.
3. **Módulo 3 — Asignación y Balanceo de Técnicos:** Motor configurable de asignación automática (por especialidad + carga activa) y centro de asignación/reasignación manual con indicadores visuales de disponibilidad.
4. **Módulo 4 — Gestión y Seguimiento de Estados:** Flujo controlado (*Pendiente* → *En proceso* → *Resuelto*) que exige diagnóstico y solución técnica antes del cierre, registrando cada cambio en un historial auditable inmutable.
5. **Módulo 5 — Detalle, Historial y Base de Soluciones:** Vista integral del expediente del ticket, cronología de estados y asignaciones, comentarios públicos/internos, adjuntos descargables y buscador histórico de fallas resueltas.
6. **Módulo 6 — Dashboard Interactivo por Rol:** Vista global gerencial para el Administrador, panel operativo para el Técnico y resumen de solicitudes para el Colaborador.
7. **Módulo 7 — Reportes Analíticos e Indicadores KPI:** Cálculo automático de **KPI 1 (Tiempo de Primera Respuesta)** y **KPI 2 (Tasa de Resolución)** con filtros multicriterio, exportación a **CSV/Excel** y formato imprimible **PDF**.
8. **Módulo 8 — Centro de Notificaciones:** Alertas automáticas reales ante registro, asignación, inicio de atención, comentarios y resolución de tickets.
