import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/ui/Badges';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { TechnicianWorkload, TicketListItem } from '../types';
import { formatDurationMinutes, formatRelativeTime } from '../utils/formatters';

export function AssignmentsPage() {
  const { showToast } = useToast();

  const [technicians, setTechnicians] = useState<TechnicianWorkload[]>([]);
  const [autoAssign, setAutoAssign] = useState<{
    enabled: boolean;
    strategy: 'SPECIALTY_AND_WORKLOAD' | 'LEAST_WORKLOAD';
  }>({ enabled: true, strategy: 'SPECIALTY_AND_WORKLOAD' });

  const [unassignedTickets, setUnassignedTickets] = useState<TicketListItem[]>([]);
  const [activeAssignedTickets, setActiveAssignedTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);

  // Asignación rápida en fila o modal
  const [selectedTechPerTicket, setSelectedTechPerTicket] = useState<Record<number, string>>({});
  const [reassignTicket, setReassignTicket] = useState<TicketListItem | null>(null);
  const [reassignTechId, setReassignTechId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const loadAssignmentData = useCallback(async () => {
    setLoading(true);
    try {
      const [techRes, unassRes, allActiveRes] = await Promise.all([
        api.get<{
          success: boolean;
          data: {
            technicians: TechnicianWorkload[];
            autoAssignment: { enabled: boolean; strategy: 'SPECIALTY_AND_WORKLOAD' | 'LEAST_WORKLOAD' };
          };
        }>('/api/technicians'),
        api.get<{ success: boolean; data: { items: TicketListItem[] } }>(
          '/api/tickets?unassignedOnly=true&pageSize=50'
        ),
        api.get<{ success: boolean; data: { items: TicketListItem[] } }>('/api/tickets?pageSize=40'),
      ]);

      setTechnicians(techRes.data.technicians);
      setAutoAssign(techRes.data.autoAssignment);
      setUnassignedTickets(unassRes.data.items.filter((t) => t.status !== 'RESUELTO'));
      setActiveAssignedTickets(
        allActiveRes.data.items.filter((t) => t.assignedTechnician !== null && t.status !== 'RESUELTO')
      );

      const defaultTech = techRes.data.technicians.find((t) => t.isUserActive && t.isAvailable);
      if (defaultTech) {
        const defaults: Record<number, string> = {};
        for (const tk of unassRes.data.items) {
          const specialist =
            techRes.data.technicians.find(
              (t) => t.isUserActive && t.isAvailable && t.specialtyCategoryCode === tk.category.code
            ) || defaultTech;
          defaults[tk.id] = String(specialist.technicianId);
        }
        setSelectedTechPerTicket(defaults);
      }
    } catch (err: any) {
      showToast(err.message || 'Error al cargar datos de asignación.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAssignmentData();
  }, [loadAssignmentData]);

  const handleToggleAutoAssign = async () => {
    try {
      const nextEnabled = !autoAssign.enabled;
      await api.put('/api/settings', {
        auto_assign_enabled: nextEnabled ? 'true' : 'false',
        auto_assign_strategy: autoAssign.strategy,
      });
      setAutoAssign((prev) => ({ ...prev, enabled: nextEnabled }));
      showToast(
        nextEnabled
          ? 'Asignación automática activada para nuevos tickets.'
          : 'Asignación automática desactivada (modo manual).',
        'info'
      );
    } catch (err: any) {
      showToast(err.message || 'No se pudo cambiar la configuración.', 'error');
    }
  };

  const handleToggleTechAvailability = async (tech: TechnicianWorkload) => {
    try {
      await api.patch(`/api/technicians/${tech.technicianId}/availability`, {
        isAvailable: !tech.isAvailable,
      });
      await loadAssignmentData();
      showToast(`Disponibilidad de ${tech.fullName} actualizada.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo actualizar disponibilidad.', 'error');
    }
  };

  const handleBatchAutoAssign = async () => {
    setBatchRunning(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        '/api/tickets/auto-assign-pending'
      );
      await loadAssignmentData();
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error en asignación masiva.', 'error');
    } finally {
      setBatchRunning(false);
    }
  };

  const handleDirectAssign = async (ticketId: number) => {
    const techId = selectedTechPerTicket[ticketId];
    if (!techId) {
      showToast('Seleccione un técnico disponible.', 'warning');
      return;
    }
    setSubmittingAssign(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/tickets/${ticketId}/assign`,
        {
          technicianId: Number(techId),
          reason: 'Asignación directa desde Centro de Carga TI.',
        }
      );
      await loadAssignmentData();
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo asignar el ticket.', 'error');
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleConfirmReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTicket || !reassignTechId) return;
    setSubmittingAssign(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/tickets/${reassignTicket.id}/assign`,
        {
          technicianId: Number(reassignTechId),
          reason: reassignReason.trim() || 'Reasignación por balanceo operativo de carga.',
        }
      );
      setReassignTicket(null);
      await loadAssignmentData();
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al reasignar.', 'error');
    } finally {
      setSubmittingAssign(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Asignación de Técnicos y Balanceo de Carga TI
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Administre la disponibilidad del equipo técnico, distribuya tickets pendientes y reasigne casos activos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadAssignmentData}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <button
            type="button"
            disabled={batchRunning || unassignedTickets.length === 0}
            onClick={handleBatchAutoAssign}
            className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-konectar-800 disabled:opacity-50 transition cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            {batchRunning
              ? 'Distribuyendo...'
              : `Auto-Asignar Cola Pendiente (${unassignedTickets.length})`}
          </button>
        </div>
      </div>

      {/* Cinta de Estado del Motor de Asignación Automática */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-600 p-2.5 text-white shrink-0">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              Motor de Asignación Dinámica:{' '}
              <span className={autoAssign.enabled ? 'text-emerald-700' : 'text-amber-700'}>
                {autoAssign.enabled ? 'ACTIVO (Automático + Manual)' : 'PAUSADO (Solo Manual)'}
              </span>
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Criterio actual:{' '}
              {autoAssign.strategy === 'SPECIALTY_AND_WORKLOAD'
                ? 'Afinidad por Especialidad Tecnológica + Menor Carga Activa'
                : 'Menor Carga de Trabajo Global (Round-Robin)'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleAutoAssign}
          className={`rounded-xl px-4 py-2 text-xs font-bold border transition shrink-0 cursor-pointer ${
            autoAssign.enabled
              ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {autoAssign.enabled ? 'Cambiar a Solo Manual' : 'Activar Auto-Asignación'}
        </button>
      </div>

      {/* Tarjetas de Carga de Trabajo de Técnicos */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-3">
          Disponibilidad y Carga Actual del Equipo de Soporte TI ({technicians.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {technicians.map((tech) => (
            <div
              key={tech.technicianId}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{tech.fullName}</p>
                      <p className="text-[11px] text-slate-500">
                        Nivel {tech.supportLevel} • {tech.employeeCode}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="mt-2.5 text-xs font-medium text-slate-600 line-clamp-1">{tech.specialty}</p>

                {/* Barra de Carga */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-600">Carga Activa</span>
                    <span className="font-extrabold text-slate-900">
                      {tech.activeLoad} / {tech.maxConcurrentTickets} tickets ({tech.loadPercentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tech.loadPercentage >= 80
                          ? 'bg-rose-500'
                          : tech.loadPercentage >= 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${tech.loadPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Contadores */}
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-amber-50/70 p-2">
                    <p className="text-sm font-extrabold text-amber-800">{tech.pendingCount}</p>
                    <p className="text-[10px] font-semibold text-amber-700">Pendientes</p>
                  </div>
                  <div className="rounded-lg bg-blue-50/70 p-2">
                    <p className="text-sm font-extrabold text-blue-800">{tech.inProgressCount}</p>
                    <p className="text-[10px] font-semibold text-blue-700">En proceso</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50/70 p-2">
                    <p className="text-sm font-extrabold text-emerald-800">{tech.resolvedCount}</p>
                    <p className="text-[10px] font-semibold text-emerald-700">Resueltos</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="text-[11px] text-slate-500">
                  1ra resp: <strong>{formatDurationMinutes(tech.avgFirstResponseMinutes)}</strong>
                </span>
                <button
                  type="button"
                  disabled={!tech.isUserActive}
                  onClick={() => handleToggleTechAvailability(tech)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    !tech.isUserActive
                      ? 'bg-slate-100 text-slate-400'
                      : tech.isAvailable
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  {!tech.isUserActive
                    ? 'Cuenta Inactiva'
                    : tech.isAvailable
                    ? '● Disponible'
                    : '○ No disponible'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cola de Tickets Pendientes de Asignación */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">
              Incidencias Pendientes de Asignación ({unassignedTickets.length})
            </h2>
          </div>
        </div>

        {unassignedTickets.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50/60 border border-emerald-200/70 py-8 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Excelente: Todas las incidencias registradas cuentan actualmente con un técnico asignado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-2.5 pr-3">Código</th>
                  <th className="py-2.5 px-3">Incidencia y Solicitante</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Prioridad</th>
                  <th className="py-2.5 px-3">Espera</th>
                  <th className="py-2.5 pl-3 text-right">Asignar Especialista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {unassignedTickets.map((tk) => (
                  <tr key={tk.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                      <Link to={`/tickets/${tk.id}`} className="hover:underline">
                        {tk.code}
                      </Link>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <p className="font-bold text-slate-900 line-clamp-1">{tk.subject}</p>
                      <p className="text-[11px] text-slate-500">
                        {tk.reporter.fullName} • {tk.department.name}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      <CategoryBadge code={tk.category.code} name={tk.category.name} />
                    </td>
                    <td className="py-3 px-3">
                      <PriorityBadge priority={tk.priority} />
                    </td>
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      {formatRelativeTime(tk.createdAt)}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <select
                          value={selectedTechPerTicket[tk.id] || ''}
                          onChange={(e) =>
                            setSelectedTechPerTicket((prev) => ({
                              ...prev,
                              [tk.id]: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                        >
                          <option value="">Seleccionar técnico...</option>
                          {technicians
                            .filter((t) => t.isUserActive)
                            .map((t) => (
                              <option key={t.technicianId} value={t.technicianId}>
                                {t.fullName} ({t.activeLoad}/{t.maxConcurrentTickets}){' '}
                                {!t.isAvailable ? '[Ocupado]' : ''}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={submittingAssign}
                          onClick={() => handleDirectAssign(tk.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                          Asignar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Incidencias Activas en Atención (Para Reasignación Rápida) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Incidencias Activas Asignadas ({activeAssignedTickets.length})
          </h2>
          <p className="text-xs text-slate-500">
            Permite reasignar tickets pendientes o en proceso ante contingencias o escalamiento de nivel.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2.5 pr-3">Código</th>
                <th className="py-2.5 px-3">Asunto</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3">Prioridad</th>
                <th className="py-2.5 px-3">Técnico Actual</th>
                <th className="py-2.5 pl-3 text-right">Reasignación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {activeAssignedTickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No existen incidencias activas en curso en este momento.
                  </td>
                </tr>
              ) : (
                activeAssignedTickets.map((tk) => (
                  <tr key={tk.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3 font-mono font-bold text-blue-700">
                      <Link to={`/tickets/${tk.id}`} className="hover:underline">
                        {tk.code}
                      </Link>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <p className="font-semibold text-slate-900 line-clamp-1">{tk.subject}</p>
                      <p className="text-[11px] text-slate-500">{tk.department.name}</p>
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={tk.status} />
                    </td>
                    <td className="py-3 px-3">
                      <PriorityBadge priority={tk.priority} />
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      {tk.assignedTechnician?.fullName}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setReassignTicket(tk);
                          const other = technicians.find(
                            (t) => t.isUserActive && t.technicianId !== tk.assignedTechnician?.id
                          );
                          setReassignTechId(other ? String(other.technicianId) : '');
                          setReassignReason('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 cursor-pointer"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Reasignar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Reasignación */}
      <Modal
        open={Boolean(reassignTicket)}
        onClose={() => setReassignTicket(null)}
        title={`Reasignar Incidencia ${reassignTicket?.code || ''}`}
        subtitle={`Actualmente asignada a: ${reassignTicket?.assignedTechnician?.fullName || ''}`}
      >
        <form onSubmit={handleConfirmReassign} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nuevo Especialista Responsable *
            </label>
            <select
              value={reassignTechId}
              onChange={(e) => setReassignTechId(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Seleccione un especialista...</option>
              {technicians
                .filter((t) => t.isUserActive && t.technicianId !== reassignTicket?.assignedTechnician?.id)
                .map((t) => (
                  <option key={t.technicianId} value={t.technicianId}>
                    {t.fullName} — Carga {t.activeLoad}/{t.maxConcurrentTickets} ({t.specialty})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motivo de Reasignación *
            </label>
            <input
              type="text"
              required
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Ej. Escalamiento a Nivel 2 / Redistribución de turno"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setReassignTicket(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingAssign || !reassignTechId}
              className="rounded-xl bg-konectar-700 px-5 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 cursor-pointer"
            >
              {submittingAssign ? 'Guardando...' : 'Confirmar Reasignación'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
