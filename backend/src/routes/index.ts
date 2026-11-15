import { Router } from 'express';
import { changePassword, getMe, login, logout, updateOwnProfile } from '../controllers/auth.controller';
import { listCategories, updateCategory } from '../controllers/categories.controller';
import { getDashboardStats } from '../controllers/dashboard.controller';
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../controllers/notifications.controller';
import { exportKpiReportCsv, getKpiReport } from '../controllers/reports.controller';
import { getSettings, updateSettings } from '../controllers/settings.controller';
import { listTechnicians, updateTechnicianAvailability } from '../controllers/technicians.controller';
import {
  addTicketComment,
  assignTicket,
  autoAssignPendingTickets,
  createTicket,
  downloadTicketAttachment,
  getTicketById,
  listTickets,
  updateTechnicalNotes,
  updateTicketStatus,
  uploadTicketAttachments,
} from '../controllers/tickets.controller';
import { createUser, getCatalogs, listUsers, toggleUserStatus, updateUser } from '../controllers/users.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { uploadAttachments } from '../middlewares/upload.middleware';

const router = Router();

// Salud del servicio
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'KONECTAR BPO S.A.C. - API Gestión de Incidencias Soporte TI',
    timestamp: new Date().toISOString(),
  });
});

// MÓDULO 1: Autenticación y Perfil
router.post('/auth/login', login);
router.post('/auth/logout', authenticate, logout);
router.get('/auth/me', authenticate, getMe);
router.patch('/auth/password', authenticate, changePassword);
router.patch('/auth/profile', authenticate, updateOwnProfile);

// Catálogos generales para formularios autenticados
router.get('/catalogs', authenticate, getCatalogs);
router.get('/categories', authenticate, listCategories);
router.put('/categories/:id', authenticate, authorize('ADMIN'), updateCategory);

// Gestión de Usuarios (Exclusivo ADMIN)
router.get('/users', authenticate, authorize('ADMIN'), listUsers);
router.post('/users', authenticate, authorize('ADMIN'), createUser);
router.put('/users/:id', authenticate, authorize('ADMIN'), updateUser);
router.patch('/users/:id/status', authenticate, authorize('ADMIN'), toggleUserStatus);

// MÓDULO 3: Técnicos y Carga de Trabajo
router.get('/technicians', authenticate, authorize('ADMIN', 'TECNICO'), listTechnicians);
router.patch('/technicians/:id/availability', authenticate, authorize('ADMIN', 'TECNICO'), updateTechnicianAvailability);

// MÓDULOS 2, 3, 4 y 5: Incidencias (Tickets), Asignación, Estados, Comentarios y Evidencias
router.get('/tickets', authenticate, listTickets);
router.post('/tickets', authenticate, uploadAttachments.array('attachments', 4), createTicket);
router.post('/tickets/auto-assign-pending', authenticate, authorize('ADMIN'), autoAssignPendingTickets);
router.get('/tickets/:id', authenticate, getTicketById);
router.post('/tickets/:id/assign', authenticate, authorize('ADMIN'), assignTicket);
router.patch('/tickets/:id/status', authenticate, authorize('ADMIN', 'TECNICO'), updateTicketStatus);
router.patch('/tickets/:id/technical-notes', authenticate, authorize('ADMIN', 'TECNICO'), updateTechnicalNotes);
router.post('/tickets/:id/comments', authenticate, addTicketComment);
router.post(
  '/tickets/:id/attachments',
  authenticate,
  uploadAttachments.array('attachments', 4),
  uploadTicketAttachments
);
router.get('/tickets/:id/attachments/:attachmentId', authenticate, downloadTicketAttachment);

// MÓDULO 6: Dashboard Interactivo
router.get('/dashboard', authenticate, getDashboardStats);

// MÓDULO 7: Reportes e Indicadores KPI
router.get('/reports/kpis', authenticate, authorize('ADMIN', 'TECNICO'), getKpiReport);
router.get('/reports/export.csv', authenticate, authorize('ADMIN', 'TECNICO'), exportKpiReportCsv);

// MÓDULO 8: Centro de Notificaciones
router.get('/notifications', authenticate, listNotifications);
router.patch('/notifications/read-all', authenticate, markAllNotificationsAsRead);
router.patch('/notifications/:id/read', authenticate, markNotificationAsRead);

// Configuración General y Auditoría (Exclusivo ADMIN)
router.get('/settings', authenticate, authorize('ADMIN'), getSettings);
router.put('/settings', authenticate, authorize('ADMIN'), updateSettings);

export default router;
