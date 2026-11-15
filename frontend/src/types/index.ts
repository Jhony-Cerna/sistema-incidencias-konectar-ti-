export type RoleCode = 'ADMIN' | 'TECNICO' | 'COLABORADOR';
export type TicketStatus = 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO';
export type TicketPriority = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type CategoryCode = 'HARDWARE' | 'SOFTWARE' | 'CONECTIVIDAD';

export interface AuthUser {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: RoleCode;
  roleName: string;
  departmentId: number;
  departmentName: string;
  departmentSite: string;
  technicianId: number | null;
  specialty: string | null;
  specialtyCategoryCode?: string | null;
  supportLevel: string | null;
  maxConcurrentTickets?: number | null;
  isAvailable: boolean | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  unreadNotifications: number;
}

export interface RoleOption {
  id: number;
  code: RoleCode;
  name: string;
  description: string;
}

export interface DepartmentOption {
  id: number;
  code: string;
  name: string;
  site: string;
}

export interface CategoryOption {
  id: number;
  code: CategoryCode;
  name: string;
  description: string;
  sla_response_minutes?: number;
  sla_resolution_minutes?: number;
  slaResponseMinutes?: number;
  slaResolutionMinutes?: number;
  totalTickets?: number;
}

export interface UserRecord {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: RoleCode;
  roleName: string;
  departmentId: number;
  departmentName: string;
  departmentSite: string;
  reportedTicketsCount: number;
  technician: {
    id: number;
    specialty: string;
    specialtyCategoryCode: string;
    supportLevel: 'N1' | 'N2';
    maxConcurrentTickets: number;
    isAvailable: boolean;
  } | null;
}

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

export interface TicketListItem {
  id: number;
  code: string;
  subject: string;
  description: string;
  incidentType: string;
  priority: TicketPriority;
  workstationCode: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  elapsedMinutes: number;
  reporter: {
    id: number;
    fullName: string;
    employeeCode: string;
  };
  department: {
    id: number;
    name: string;
  };
  category: {
    id: number;
    code: CategoryCode;
    name: string;
    slaResponseMinutes: number;
    slaResolutionMinutes: number;
  };
  assignedTechnician: {
    id: number;
    fullName: string;
    specialty: string;
    supportLevel: string;
  } | null;
  commentsCount: number;
  attachmentsCount: number;
}

export interface TicketStatusHistoryItem {
  id: number;
  previousStatus: TicketStatus | null;
  newStatus: TicketStatus;
  comment: string;
  createdAt: string;
  changedBy: {
    id: number;
    fullName: string;
    role: RoleCode;
    roleName: string;
  };
}

export interface TicketAssignmentHistoryItem {
  id: number;
  assignmentMode: 'AUTOMATICA' | 'MANUAL' | 'REASIGNACION';
  reason: string | null;
  createdAt: string;
  technicianName: string;
  previousTechnicianName: string | null;
  assignedByName: string;
}

export interface TicketCommentItem {
  id: number;
  content: string;
  isInternal: boolean;
  createdAt: string;
  author: {
    id: number;
    fullName: string;
    role: RoleCode;
    roleName: string;
  };
}

export interface TicketAttachmentItem {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByName: string;
  downloadUrl: string;
}

export interface TicketDetail extends Omit<TicketListItem, 'reporter' | 'department' | 'assignedTechnician' | 'commentsCount' | 'attachmentsCount'> {
  diagnosis: string | null;
  solution: string | null;
  reporter: {
    id: number;
    fullName: string;
    email: string;
    phone: string | null;
    employeeCode: string;
  };
  department: {
    id: number;
    name: string;
    site: string;
  };
  assignedTechnician: {
    id: number;
    userId: number;
    fullName: string;
    email: string;
    specialty: string;
    supportLevel: string;
  } | null;
  statusHistory: TicketStatusHistoryItem[];
  assignmentHistory: TicketAssignmentHistoryItem[];
  comments: TicketCommentItem[];
  attachments: TicketAttachmentItem[];
}

export interface DashboardData {
  roleScope: RoleCode;
  summary: {
    totalTickets: number;
    pendingTickets: number;
    inProgressTickets: number;
    resolvedTickets: number;
    unassignedTickets: number;
    activeCriticalTickets: number;
    avgFirstResponseMinutes: number;
    avgResolutionMinutes: number;
    resolutionRate: number;
  };
  byCategory: {
    id: number;
    code: CategoryCode;
    name: string;
    total: number;
    pending: number;
    inProgress: number;
    resolved: number;
  }[];
  byPriority: {
    priority: TicketPriority;
    total: number;
  }[];
  trend: {
    date: string;
    registered: number;
    resolved: number;
  }[];
  techniciansPerformance: TechnicianWorkload[];
  recentTickets: {
    id: number;
    code: string;
    subject: string;
    priority: TicketPriority;
    status: TicketStatus;
    createdAt: string;
    categoryName: string;
    categoryCode: CategoryCode;
    reporterName: string;
    departmentName: string;
    technicianName: string | null;
  }[];
}

export interface KpiReportData {
  generatedAt: string;
  kpis: {
    totalRegistered: number;
    pendingCount: number;
    inProgressCount: number;
    resolvedCount: number;
    respondedCount: number;
    avgFirstResponseMinutes: number;
    minFirstResponseMinutes: number;
    maxFirstResponseMinutes: number;
    slaResponseComplianceRate: number;
    resolutionRate: number;
    avgResolutionMinutes: number;
  };
  byCategory: {
    categoryId: number;
    code: string;
    name: string;
    slaTargetMinutes: number;
    total: number;
    resolved: number;
    inProgress: number;
    pending: number;
    resolutionRate: number;
    avgFirstResponseMinutes: number | null;
  }[];
  byTechnician: {
    technicianId: number;
    technicianName: string;
    specialty: string;
    supportLevel: string;
    totalAssigned: number;
    resolved: number;
    inProgress: number;
    pending: number;
    resolutionRate: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
  }[];
  byDepartment: {
    departmentName: string;
    total: number;
    resolved: number;
  }[];
  timeline: {
    date: string;
    totalRegistered: number;
    resolvedCount: number;
    resolutionRate: number;
    avgFirstResponseMinutes: number;
  }[];
  detailedTickets: {
    id: number;
    code: string;
    subject: string;
    priority: TicketPriority;
    status: TicketStatus;
    categoryName: string;
    departmentName: string;
    reporterName: string;
    technicianName: string;
    createdAt: string;
    firstResponseAt: string | null;
    resolvedAt: string | null;
    firstResponseMinutes: number | null;
    resolutionMinutes: number | null;
  }[];
}

export interface NotificationItem {
  id: number;
  ticketId: number | null;
  ticketCode: string | null;
  ticketStatus: TicketStatus | null;
  eventType: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
