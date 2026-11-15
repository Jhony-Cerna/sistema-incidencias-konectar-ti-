import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gauge,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  Ticket,
  Timer,
  UserCheck,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/ui/Badges';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { DashboardData } from '../types';
import { formatDurationMinutes, formatRelativeTime, formatShortDate } from '../utils/formatters';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICA: '#e11d48',
  ALTA: '#f97316',
  MEDIA: '#0284c7',
  BAJA: '#64748b',
};

export function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: DashboardData }>('/api/dashboard');
      setData(res.data);
    } catch (err: any) {
      showToast(err.message || 'No se pudo cargar el panel de control.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
        <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Cargando métricas en tiempo real...</p>
      </div>
    );
  }

  if (!data || !user) return null;

  const { summary } = data;

  const roleHeader = {
    ADMIN: {
      title: 'Panel de Control Global - Soporte TI',
      subtitle: 'Monitoreo integral de incidencias, carga técnica e indicadores SLA de Sede Lima Norte.',
    },
    TECNICO: {
      title: 'Panel Operativo del Especialista TI',
      subtitle: 'Resumen de sus tickets asignados, tiempos de respuesta y productividad personal.',
    },
    COLABORADOR: {
      title: 'Resumen de Mis Solicitudes Tecnológicas',
      subtitle: 'Estado en tiempo real e historial de atención de sus incidencias reportadas.',
    },
  }[user.role];

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{roleHeader.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{roleHeader.subtitle}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchDashboard}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          {(user.role === 'COLABORADOR' || user.role === 'ADMIN') && (
            <Link
              to="/tickets/nuevo"
              className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-konectar-800 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Registrar Incidencia
            </Link>
          )}
        </div>
      </div>

      {/* Alerta operativa para ADMIN si existen tickets sin asignar */}
      {user.role === 'ADMIN' && summary.unassignedTickets > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/15 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950">
                Atención requerida: {summary.unassignedTickets} incidencia(s) pendiente(s) de asignación
              </p>
              <p className="text-xs text-amber-800">
                Asigne un especialista manualmente o ejecute el balanceo automático de carga.
              </p>
            </div>
          </div>
          <Link
            to="/asignaciones"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shrink-0"
          >
            <UserCheck className="h-4 w-4" />
            Ir a Asignación TI
          </Link>
        </div>
      )}

      {/* Tarjetas de Indicadores Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Registradas"
          value={summary.totalTickets}
          subtitle="Volumen acumulado"
          icon={Ticket}
          tone="slate"
        />
        <StatCard
          title="Pendientes"
          value={summary.pendingTickets}
          subtitle="En espera de inicio"
          icon={Clock}
          tone="amber"
        />
        <StatCard
          title="En Proceso"
          value={summary.inProgressTickets}
          subtitle="Atención técnica activa"
          icon={PlayCircle}
          tone="blue"
        />
        <StatCard
          title="Resueltas"
          value={summary.resolvedTickets}
          subtitle="Con solución aplicada"
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          title="KPI 1: 1ra Respuesta"
          value={formatDurationMinutes(summary.avgFirstResponseMinutes)}
          subtitle="Promedio hasta 1ra atención"
          icon={Timer}
          tone="indigo"
        />
        <StatCard
          title="KPI 2: Tasa Resolución"
          value={`${summary.resolutionRate}%`}
          subtitle="Atendidas exitosamente"
          icon={Gauge}
          tone={summary.resolutionRate >= 70 ? 'emerald' : 'rose'}
        />
      </div>

      {/* Gráficos Estadísticos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Evolución por Período */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Evolución de Incidencias por Período</h2>
              <p className="text-xs text-slate-500">Comparativa de solicitudes registradas frente a resueltas</p>
            </div>
          </div>
          <div className="h-72">
            {data.trend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Sin registros en el período actual.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(lbl) => `Fecha: ${lbl}`}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="registered"
                    name="Registradas"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorReg)"
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    name="Resueltas"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorRes)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Incidencias por Categoría */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900">Incidencias por Categoría Tecnológica</h2>
            <p className="text-xs text-slate-500">Hardware, Software y Conectividad por estado actual</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byCategory} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="pending" name="Pendiente" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="inProgress" name="En proceso" stackId="a" fill="#3b82f6" />
                <Bar dataKey="resolved" name="Resuelto" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Segunda fila: Técnicos (para ADMIN) + Prioridad + Tabla reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {user.role === 'ADMIN' && (
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Desempeño y Carga por Técnico TI</h2>
                <p className="text-xs text-slate-500">
                  Tickets asignados, resueltos y tiempo promedio de primera respuesta
                </p>
              </div>
              <Link
                to="/asignaciones"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
              >
                Gestionar carga <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-2.5 pr-3">Especialista</th>
                    <th className="py-2.5 px-2 text-center">Estado</th>
                    <th className="py-2.5 px-2 text-center">Carga Activa</th>
                    <th className="py-2.5 px-2 text-center">Resueltos</th>
                    <th className="py-2.5 pl-2 text-right">1ra Respuesta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.techniciansPerformance.map((tech) => (
                    <tr key={tech.technicianId} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900">{tech.fullName}</p>
                        <p className="text-[11px] text-slate-500">
                          {tech.supportLevel} • {tech.specialty}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            tech.isAvailable && tech.isUserActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {tech.isAvailable && tech.isUserActive ? 'Disponible' : 'No disp.'}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-bold text-slate-800">
                            {tech.activeLoad} / {tech.maxConcurrentTickets}
                          </span>
                          <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                tech.loadPercentage >= 80
                                  ? 'bg-rose-500'
                                  : tech.loadPercentage >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-blue-600'
                              }`}
                              style={{ width: `${tech.loadPercentage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-emerald-700">
                        {tech.resolvedCount}
                      </td>
                      <td className="py-3 pl-2 text-right font-medium text-slate-700">
                        {formatDurationMinutes(tech.avgFirstResponseMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Distribución por Prioridad */}
        <div
          className={`${
            user.role === 'ADMIN' ? 'lg:col-span-5' : 'lg:col-span-4'
          } rounded-2xl border border-slate-200 bg-white p-5 shadow-xs`}
        >
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">Severidad / Prioridad de Tickets</h2>
            <p className="text-xs text-slate-500">Clasificación operativa según impacto</p>
          </div>
          <div className="h-60">
            {data.byPriority.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Sin tickets registrados.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byPriority}
                    dataKey="total"
                    nameKey="priority"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    {data.byPriority.map((entry) => (
                      <Cell
                        key={entry.priority}
                        fill={PRIORITY_COLORS[entry.priority] || '#64748b'}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tabla de Incidencias Recientes */}
        <div
          className={`${
            user.role === 'ADMIN' ? 'lg:col-span-12' : 'lg:col-span-8'
          } rounded-2xl border border-slate-200 bg-white p-5 shadow-xs`}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Incidencias Recientes</h2>
              <p className="text-xs text-slate-500">Últimos requerimientos registrados y su estado actual</p>
            </div>
            <Link
              to="/tickets"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Ver todas las incidencias <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-2.5 pr-3">Código</th>
                  <th className="py-2.5 px-3">Asunto y Área</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Prioridad</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Técnico</th>
                  <th className="py-2.5 pl-3 text-right">Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data.recentTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No hay incidencias registradas aún.
                    </td>
                  </tr>
                ) : (
                  data.recentTickets.map((tk) => (
                    <tr key={tk.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 pr-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <Link to={`/tickets/${tk.id}`} className="hover:underline">
                          {tk.code}
                        </Link>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        <Link
                          to={`/tickets/${tk.id}`}
                          className="font-semibold text-slate-900 hover:text-blue-700 line-clamp-1"
                        >
                          {tk.subject}
                        </Link>
                        <p className="text-[11px] text-slate-500 truncate">
                          {tk.reporterName} • {tk.departmentName}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <CategoryBadge code={tk.categoryCode} name={tk.categoryName} />
                      </td>
                      <td className="py-3 px-3">
                        <PriorityBadge priority={tk.priority} />
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={tk.status} />
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {tk.technicianName || (
                          <span className="text-amber-600 font-medium">Por asignar</span>
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right text-slate-500 whitespace-nowrap">
                        {formatRelativeTime(tk.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
