import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpenCheck,
  Building2,
  CheckCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
  ShieldCheck,
  Ticket,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { NotificationItem } from '../../types';
import { formatRelativeTime } from '../../utils/formatters';

export function MainLayout() {
  const { user, logout, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [togglingAvail, setTogglingAvail] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifPopoverOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadPopoverNotifications = async () => {
    try {
      const res = await api.get<{
        success: boolean;
        data: { unreadCount: number; items: NotificationItem[] };
      }>('/api/notifications?limit=8');
      setRecentNotifications(res.data.items);
      refreshUser();
    } catch {
      // Silencioso en popover
    }
  };

  const handleToggleNotifPopover = () => {
    const next = !notifPopoverOpen;
    setNotifPopoverOpen(next);
    if (next) {
      loadPopoverNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      await loadPopoverNotifications();
      showToast('Notificaciones marcadas como leídas.', 'info');
    } catch (err: any) {
      showToast(err.message || 'No se pudo actualizar.', 'error');
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await api.patch(`/api/notifications/${item.id}/read`);
        refreshUser();
      } catch {
        // Ignorar
      }
    }
    setNotifPopoverOpen(false);
    if (item.ticketId) {
      navigate(`/tickets/${item.ticketId}`);
    } else {
      navigate('/notificaciones');
    }
  };

  const handleToggleAvailability = async () => {
    if (!user?.technicianId || togglingAvail) return;
    setTogglingAvail(true);
    try {
      const nextState = !user.isAvailable;
      await api.patch(`/api/technicians/${user.technicianId}/availability`, {
        isAvailable: nextState,
      });
      await refreshUser();
      showToast(
        nextState
          ? 'Estado actualizado: Disponible para recibir tickets.'
          : 'Estado actualizado: No disponible para asignación automática.',
        nextState ? 'success' : 'warning'
      );
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar disponibilidad.', 'error');
    } finally {
      setTogglingAvail(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('Sesión finalizada correctamente.', 'info');
    navigate('/login');
  };

  if (!user) return null;

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard Principal',
      icon: LayoutDashboard,
      roles: ['ADMIN', 'TECNICO', 'COLABORADOR'],
    },
    {
      to: '/tickets/nuevo',
      label: 'Registrar Incidencia',
      icon: PlusCircle,
      roles: ['ADMIN', 'COLABORADOR'],
    },
    {
      to: '/tickets',
      label:
        user.role === 'ADMIN'
          ? 'Gestión de Incidencias'
          : user.role === 'TECNICO'
          ? 'Mis Tickets Asignados'
          : 'Mis Solicitudes TI',
      icon: Ticket,
      roles: ['ADMIN', 'TECNICO', 'COLABORADOR'],
    },
    {
      to: '/asignaciones',
      label: 'Asignación de Técnicos',
      icon: UserCheck,
      roles: ['ADMIN'],
    },
    {
      to: '/base-conocimiento',
      label: 'Historial de Soluciones',
      icon: BookOpenCheck,
      roles: ['ADMIN', 'TECNICO'],
    },
    {
      to: '/reportes',
      label: 'Reportes e Indicadores KPI',
      icon: BarChart3,
      roles: ['ADMIN', 'TECNICO'],
    },
    {
      to: '/usuarios',
      label: 'Usuarios y Técnicos',
      icon: Users,
      roles: ['ADMIN'],
    },
    {
      to: '/notificaciones',
      label: 'Centro de Notificaciones',
      icon: Bell,
      roles: ['ADMIN', 'TECNICO', 'COLABORADOR'],
      badge: user.unreadNotifications > 0 ? user.unreadNotifications : undefined,
    },
    {
      to: '/configuracion',
      label: 'Configuración y Auditoría',
      icon: Settings,
      roles: ['ADMIN'],
    },
    {
      to: '/perfil',
      label: 'Mi Perfil y Seguridad',
      icon: UserCog,
      roles: ['ADMIN', 'TECNICO', 'COLABORADOR'],
    },
  ].filter((item) => item.roles.includes(user.role));

  const roleBadgeColor = {
    ADMIN: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    TECNICO: 'bg-sky-500/20 text-sky-300 border-sky-400/30',
    COLABORADOR: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
  }[user.role];

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-konectar-900 text-slate-100 select-none">
      {/* Encabezado de marca KONECTAR BPO */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-konectar-950 font-black text-xl shadow-lg">
            K
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-tight text-white text-base">KONECTAR</span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                BPO
              </span>
            </div>
            <p className="text-[11px] text-slate-300/80 font-medium">Mesa de Ayuda • Soporte TI</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tarjeta de usuario en Sidebar */}
      <div className="px-4 py-4 border-b border-white/10 bg-konectar-950/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/40 border border-blue-400/40 text-xs font-bold text-white">
            {user.fullName
              .split(' ')
              .slice(0, 2)
              .map((w) => w[0])
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{user.fullName}</p>
            <p className="truncate text-[11px] text-slate-300/80">{user.departmentName}</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${roleBadgeColor}`}>
            <ShieldCheck className="h-3 w-3" />
            {user.roleName}
          </span>
          <span className="text-[10px] font-mono text-slate-400">{user.employeeCode}</span>
        </div>
      </div>

      {/* Navegación modular */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/tickets'}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-slate-950">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Pie institucional */}
      <div className="border-t border-white/10 p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
          <Building2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="truncate">KONECTAR BPO S.A.C. • Lima Norte</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 hover:text-white transition"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-68 lg:flex-col w-64 no-print">
        {renderSidebarContent()}
      </aside>

      {/* Drawer Móvil */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full">{renderSidebarContent()}</div>
        </div>
      )}

      {/* Contenido Principal */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        {/* Barra Superior */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 truncate">
                Plataforma Centralizada de Gestión y Seguimiento de Incidencias TI
              </p>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {user.departmentSite} • {user.departmentName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Switch rápido de disponibilidad para Técnicos */}
            {user.role === 'TECNICO' && user.technicianId && (
              <button
                type="button"
                disabled={togglingAvail}
                onClick={handleToggleAvailability}
                className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  user.isAvailable
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    user.isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {user.isAvailable ? 'Disponible TI' : 'No disponible'}
              </button>
            )}

            {/* Botón rápido de Nueva Incidencia */}
            {(user.role === 'COLABORADOR' || user.role === 'ADMIN') && (
              <Link
                to="/tickets/nuevo"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-konectar-800 transition"
              >
                <PlusCircle className="h-4 w-4" />
                Nuevo Ticket
              </Link>
            )}

            {/* Campana de Notificaciones */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={handleToggleNotifPopover}
                className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                aria-label="Notificaciones"
              >
                <Bell className="h-5 w-5" />
                {user.unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow">
                    {user.unreadNotifications > 9 ? '9+' : user.unreadNotifications}
                  </span>
                )}
              </button>

              {notifPopoverOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Notificaciones Recientes</p>
                      <p className="text-[11px] text-slate-500">
                        {user.unreadNotifications} aviso(s) sin leer
                      </p>
                    </div>
                    {user.unreadNotifications > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Leer todas
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {recentNotifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No tienes notificaciones registradas.
                      </div>
                    ) : (
                      recentNotifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3 ${
                            !n.isRead ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              !n.isRead ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">{n.title}</p>
                            <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {formatRelativeTime(n.createdAt)}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-center">
                    <Link
                      to="/notificaciones"
                      className="text-xs font-semibold text-konectar-700 hover:underline"
                    >
                      Abrir Centro de Notificaciones →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Área de Vistas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 print-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
