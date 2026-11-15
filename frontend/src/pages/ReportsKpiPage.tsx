import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  FileSpreadsheet,
  Gauge,
  Printer,
  RefreshCw,
  Timer,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PriorityBadge, StatusBadge } from '../components/ui/Badges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { CategoryOption, KpiReportData, TechnicianWorkload } from '../types';
import { formatDateTime, formatDurationMinutes, formatShortDate } from '../utils/formatters';

export function ReportsKpiPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [report, setReport] = useState<KpiReportData | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filtros del Módulo 7
  const [period, setPeriod] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const [catRes, techRes] = await Promise.all([
          api.get<{ success: boolean; data: CategoryOption[] }>('/api/categories'),
          api.get<{ success: boolean; data: { technicians: TechnicianWorkload[] } }>('/api/technicians'),
        ]);
        setCategories(catRes.data);
        setTechnicians(techRes.data.technicians);
      } catch {
        // Silencioso
      }
    };
    loadCatalogs();
  }, []);

  const buildQueryString = useCallback(() => {
    const qs = new URLSearchParams();
    if (dateFrom || dateTo) {
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
    } else if (period && period !== 'all') {
      qs.set('period', period);
    }
    if (technicianId) qs.set('technicianId', technicianId);
    if (categoryId) qs.set('categoryId', categoryId);
    if (status) qs.set('status', status);
    if (user?.role === 'TECNICO' && !technicianId) {
      qs.set('onlyMine', 'true');
    }
    return qs.toString();
  }, [period, dateFrom, dateTo, technicianId, categoryId, status, user?.role]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQueryString();
      const res = await api.get<{ success: boolean; data: KpiReportData }>(
        `/api/reports/kpis${qs ? `?${qs}` : ''}`
      );
      setReport(res.data);
    } catch (err: any) {
      showToast(err.message || 'No se pudo generar el reporte de KPIs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [buildQueryString, showToast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const qs = buildQueryString();
      await api.downloadBlob(
        `/api/reports/export.csv${qs ? `?${qs}` : ''}`,
        `Reporte_KPI_SoporteTI_KONECTAR_${new Date().toISOString().slice(0, 10)}.csv`
      );
      showToast('Reporte CSV (compatible con Excel) descargado exitosamente.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al exportar reporte CSV.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado visible también en impresión ejecutiva */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            KONECTAR BPO S.A.C. • Sede Lima Norte • Área de Soporte TI
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            Reportes Analíticos e Indicadores Clave de Rendimiento (KPIs)
          </h1>
          <p className="text-sm text-slate-500">
            Evaluación cuantitativa del Tiempo de Primera Respuesta y la Tasa de Resolución a partir de registros reales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={fetchReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recalcular
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar CSV / Excel'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-konectar-900 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Filtros Dinámicos del Reporte */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Período Rápido</label>
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setDateFrom('');
                setDateTo('');
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">Todo el historial</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Fecha Inicio</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Fecha Fin</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {user?.role === 'ADMIN' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Técnico TI</label>
              <select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="">Todos los técnicos</option>
                {technicians.map((t) => (
                  <option key={t.technicianId} value={t.technicianId}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Categoría</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="RESUELTO">Resuelto</option>
            </select>
          </div>
        </div>
      </div>

      {report && (
        <>
          {/* Tarjetas Protagonistas de los 2 KPIs Oficiales del Proyecto Académico */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* KPI 1 */}
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/50 p-6 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-extrabold text-indigo-800">
                    INDICADOR KPI 1
                  </span>
                  <h2 className="mt-2 text-lg font-extrabold text-slate-900">
                    Tiempo Promedio de Primera Respuesta
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    Fórmula: Fecha Primera Respuesta − Fecha Registro
                  </p>
                </div>
                <div className="rounded-2xl bg-indigo-600 p-3 text-white shadow-md">
                  <Timer className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-baseline gap-4">
                <span className="text-4xl font-black text-indigo-950 tracking-tight">
                  {report.kpis.respondedCount > 0
                    ? `${report.kpis.avgFirstResponseMinutes} min`
                    : 'Sin datos'}
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                  Cumplimiento SLA: {report.kpis.slaResponseComplianceRate}%
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-indigo-100 pt-4 text-xs">
                <div>
                  <p className="text-slate-500">Tickets Atendidos</p>
                  <p className="font-bold text-slate-900">{report.kpis.respondedCount}</p>
                </div>
                <div>
                  <p className="text-slate-500">Mínimo Registrado</p>
                  <p className="font-bold text-emerald-700">
                    {report.kpis.respondedCount > 0 ? `${report.kpis.minFirstResponseMinutes} min` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Máximo Registrado</p>
                  <p className="font-bold text-slate-800">
                    {report.kpis.respondedCount > 0 ? `${report.kpis.maxFirstResponseMinutes} min` : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50 p-6 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">
                    INDICADOR KPI 2
                  </span>
                  <h2 className="mt-2 text-lg font-extrabold text-slate-900">
                    Tasa de Resolución de Incidencias
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    Fórmula: (Incidencias Resueltas / Total Registradas) × 100
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-600 p-3 text-white shadow-md">
                  <Gauge className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-baseline gap-4">
                <span className="text-4xl font-black text-emerald-950 tracking-tight">
                  {report.kpis.resolutionRate}%
                </span>
                <span className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-1">
                  {report.kpis.resolvedCount} de {report.kpis.totalRegistered} tickets resueltos
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-emerald-100 pt-4 text-xs">
                <div>
                  <p className="text-slate-500">En Proceso</p>
                  <p className="font-bold text-blue-700">{report.kpis.inProgressCount}</p>
                </div>
                <div>
                  <p className="text-slate-500">Pendientes</p>
                  <p className="font-bold text-amber-700">{report.kpis.pendingCount}</p>
                </div>
                <div>
                  <p className="text-slate-500">Prom. Resolución</p>
                  <p className="font-bold text-slate-900">
                    {formatDurationMinutes(report.kpis.avgResolutionMinutes)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Gráficos Analíticos */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">
                Comportamiento Histórico de Tiempo de 1ra Respuesta (min) y Volumen
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Tendencia por fecha de registro en la base de datos operativa
              </p>
              <div className="h-72">
                {report.timeline.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Sin datos para los filtros seleccionados.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={report.timeline} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="m" />
                      <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        yAxisId="left"
                        dataKey="resolvedCount"
                        name="Tickets Resueltos"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="avgFirstResponseMinutes"
                        name="KPI 1: 1ra Respuesta (min)"
                        stroke="#4f46e5"
                        strokeWidth={2.5}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">
                Incidencias por Área / Departamento BPO
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Demanda de soporte tecnológico según área organizacional
              </p>
              <div className="h-72">
                {report.byDepartment.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Sin registros.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={report.byDepartment}
                      margin={{ top: 5, right: 16, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="departmentName"
                        type="category"
                        width={125}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                      <Bar dataKey="total" name="Registradas" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Tablas Comparativas por Categoría y por Técnico */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Indicadores por Categoría TI</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-2 pr-2">Categoría</th>
                      <th className="py-2 px-2 text-center">Total</th>
                      <th className="py-2 px-2 text-center">Tasa Res.</th>
                      <th className="py-2 pl-2 text-right">1ra Resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byCategory.map((c) => (
                      <tr key={c.categoryId}>
                        <td className="py-3 pr-2 font-bold text-slate-900">
                          {c.name}
                          <span className="block text-[10px] font-normal text-slate-400">
                            Meta SLA ≤ {c.slaTargetMinutes}m
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-semibold">{c.total}</td>
                        <td className="py-3 px-2 text-center font-bold text-emerald-700">
                          {c.resolutionRate}%
                        </td>
                        <td className="py-3 pl-2 text-right font-semibold text-indigo-700">
                          {c.avgFirstResponseMinutes !== null ? `${c.avgFirstResponseMinutes} min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                Productividad e Indicadores KPI por Técnico de Soporte TI
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-2 pr-2">Técnico</th>
                      <th className="py-2 px-2 text-center">Asignados</th>
                      <th className="py-2 px-2 text-center">Resueltos</th>
                      <th className="py-2 px-2 text-center">KPI 2 (%)</th>
                      <th className="py-2 px-2 text-right">KPI 1 (1ra Resp)</th>
                      <th className="py-2 pl-2 text-right">Prom. Cierre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byTechnician.map((t) => (
                      <tr key={t.technicianId}>
                        <td className="py-3 pr-2">
                          <p className="font-bold text-slate-900">{t.technicianName}</p>
                          <p className="text-[10px] text-slate-500">
                            {t.supportLevel} • {t.specialty}
                          </p>
                        </td>
                        <td className="py-3 px-2 text-center font-semibold">{t.totalAssigned}</td>
                        <td className="py-3 px-2 text-center font-bold text-emerald-700">{t.resolved}</td>
                        <td className="py-3 px-2 text-center font-bold text-slate-900">
                          {t.resolutionRate}%
                        </td>
                        <td className="py-3 px-2 text-right font-semibold text-indigo-700">
                          {t.avgFirstResponseMinutes !== null ? `${t.avgFirstResponseMinutes} min` : '—'}
                        </td>
                        <td className="py-3 pl-2 text-right text-slate-600">
                          {formatDurationMinutes(t.avgResolutionMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Matriz Detallada de Tickets Evaluados */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Matriz Auditable de Incidencias del Período ({report.detailedTickets.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Detalle individual de tiempos empleados para el cálculo de KPI 1 y KPI 2
                </p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-2.5 pr-3">Código</th>
                    <th className="py-2.5 px-2">Asunto / Área</th>
                    <th className="py-2.5 px-2">Categoría</th>
                    <th className="py-2.5 px-2">Prioridad</th>
                    <th className="py-2.5 px-2">Estado</th>
                    <th className="py-2.5 px-2">Técnico</th>
                    <th className="py-2.5 px-2 text-right">1ra Respuesta</th>
                    <th className="py-2.5 pl-2 text-right">Resolución Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.detailedTickets.map((tk) => (
                    <tr key={tk.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <Link to={`/tickets/${tk.id}`} className="hover:underline">
                          {tk.code}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2 max-w-xs">
                        <p className="font-semibold text-slate-900 truncate">{tk.subject}</p>
                        <p className="text-[10px] text-slate-500">
                          {tk.departmentName} • {formatDateTime(tk.createdAt)}
                        </p>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">{tk.categoryName}</td>
                      <td className="py-2.5 px-2">
                        <PriorityBadge priority={tk.priority} />
                      </td>
                      <td className="py-2.5 px-2">
                        <StatusBadge status={tk.status} />
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-700">{tk.technicianName}</td>
                      <td className="py-2.5 px-2 text-right font-semibold text-indigo-700 whitespace-nowrap">
                        {tk.firstResponseMinutes !== null ? `${tk.firstResponseMinutes} min` : '—'}
                      </td>
                      <td className="py-2.5 pl-2 text-right text-slate-700 whitespace-nowrap">
                        {tk.resolutionMinutes !== null ? formatDurationMinutes(tk.resolutionMinutes) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
