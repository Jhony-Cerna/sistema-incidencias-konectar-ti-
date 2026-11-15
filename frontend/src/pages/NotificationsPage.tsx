import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { StatusBadge } from '../components/ui/Badges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { NotificationItem } from '../types';
import { formatDateTime } from '../utils/formatters';

export function NotificationsPage() {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        success: boolean;
        data: { unreadCount: number; items: NotificationItem[] };
      }>(`/api/notifications?limit=80${unreadOnly ? '&unreadOnly=true' : ''}`);
      setItems(res.data.items);
      setUnreadCount(res.data.unreadCount);
      await refreshUser();
    } catch (err: any) {
      showToast(err.message || 'Error al cargar notificaciones.', 'error');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, refreshUser, showToast]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkOne = async (n: NotificationItem) => {
    if (!n.isRead) {
      try {
        await api.patch(`/api/notifications/${n.id}/read`);
        await loadNotifications();
      } catch {
        // Ignorar
      }
    }
    if (n.ticketId) {
      navigate(`/tickets/${n.ticketId}`);
    }
  };

  const handleMarkAll = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      await loadNotifications();
      showToast('Todas sus notificaciones fueron marcadas como leídas.', 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo completar la acción.', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Centro de Notificaciones Operativas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Avisos en tiempo real sobre registro, asignación, cambios de estado y resolución de incidencias.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              unreadOnly
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {unreadOnly ? 'Mostrando solo no leídas' : `No leídas (${unreadCount})`}
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-4 py-2 text-xs font-bold text-white hover:bg-konectar-800 transition cursor-pointer"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar todas como leídas
            </button>
          )}

          <button
            type="button"
            onClick={loadNotifications}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs divide-y divide-slate-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Bell className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Sin notificaciones para mostrar</p>
            <p className="text-xs text-slate-400">
              Los eventos de sus tickets aparecerán automáticamente en esta bandeja.
            </p>
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              onClick={() => handleMarkOne(n)}
              className={`flex items-start justify-between gap-4 p-4 sm:p-5 transition cursor-pointer hover:bg-slate-50 ${
                !n.isRead ? 'bg-blue-50/40' : ''
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${
                    !n.isRead ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'
                  }`}
                />
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs sm:text-sm font-bold text-slate-900">{n.title}</p>
                    {n.ticketCode && (
                      <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.2">
                        {n.ticketCode}
                      </span>
                    )}
                    {n.ticketStatus && <StatusBadge status={n.ticketStatus} />}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  <p className="text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                </div>
              </div>

              {n.ticketId && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 shrink-0 mt-1">
                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
