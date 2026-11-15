import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  MessageSquare,
  Paperclip,
  PlusCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/ui/Badges';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { CategoryOption, TechnicianWorkload, TicketListItem } from '../types';
import { formatDateTime, formatDurationMinutes } from '../utils/formatters';

export function TicketsListPage({ knowledgeMode = false }: { knowledgeMode?: boolean }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(knowledgeMode ? 'RESUELTO' : '');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    setStatus(knowledgeMode ? 'RESUELTO' : '');
    setPage(1);
  }, [knowledgeMode]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const catRes = await api.get<{ success: boolean; data: CategoryOption[] }>('/api/categories');
        setCategories(catRes.data);
        if (user?.role === 'ADMIN') {
          const techRes = await api.get<{
            success: boolean;
            data: { technicians: TechnicianWorkload[] };
          }>('/api/technicians');
          setTechnicians(techRes.data.technicians);
        }
      } catch {
        // Silencioso
      }
    };
    loadFilters();
  }, [user?.role]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(page));
      qs.set('pageSize', '15');
      if (knowledgeMode) {
        qs.set('scope', 'knowledge');
        qs.set('status', 'RESUELTO');
      } else if (status) {
        qs.set('status', status);
      }
      if (search.trim()) qs.set('search', search.trim());
      if (categoryId) qs.set('categoryId', categoryId);
      if (priority) qs.set('priority', priority);
      if (technicianId && user?.role === 'ADMIN') qs.set('technicianId', technicianId);

      const res = await api.get<{
        success: boolean;
        data: {
          items: TicketListItem[];
          pagination: { page: number; pageSize: number; total: number; totalPages: number };
        };
      }>(`/api/tickets?${qs.toString()}`);

      setTickets(res.data.items);
      setTotalPages(res.data.pagination.totalPages);
      setTotalItems(res.data.pagination.total);
    } catch (err: any) {
      showToast(err.message || 'Error al consultar incidencias.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, knowledgeMode, status, search, categoryId, priority, technicianId, user?.role, showToast]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const clearFilters = () => {
    setSearch('');
    setStatus(knowledgeMode ? 'RESUELTO' : '');
    setCategoryId('');
    setPriority('');
    setTechnicianId('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    search || (!knowledgeMode && status) || categoryId || priority || technicianId
  );

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {knowledgeMode && <BookOpenCheck className="h-6 w-6 text-emerald-600" />}
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {knowledgeMode
                ? 'Historial Consolidado de Soluciones TI'
                : user?.role === 'ADMIN'
                ? 'Administración General de Incidencias'
                : user?.role === 'TECNICO'
                ? 'Mis Incidencias Asignadas'
                : 'Mis Solicitudes e Historial de Incidencias'}
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {knowledgeMode
              ? 'Base histórica de problemas recurrentes con diagnósticos y soluciones aplicadas por Soporte TI.'
              : `${totalItems} registro(s) encontrado(s) con seguimiento estructurado en tiempo real.`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchTickets}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
          {!knowledgeMode && (user?.role === 'COLABORADOR' || user?.role === 'ADMIN') && (
            <Link
              to="/tickets/nuevo"
              className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-konectar-800 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Nueva Incidencia
            </Link>
          )}
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por código INC, asunto, usuario o PC..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          {!knowledgeMode && (
            <div className="md:col-span-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="">Todos los estados</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_PROCESO">En proceso</option>
                <option value="RESUELTO">Resuelto</option>
              </select>
            </div>
          )}

          <div className={knowledgeMode ? 'md:col-span-4' : 'md:col-span-2'}>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
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

          <div className={knowledgeMode ? 'md:col-span-4' : 'md:col-span-2'}>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Todas las prioridades</option>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          {!knowledgeMode && user?.role === 'ADMIN' && (
            <div className="md:col-span-2">
              <select
                value={technicianId}
                onChange={(e) => {
                  setTechnicianId(e.target.value);
                  setPage(1);
                }}
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
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              Filtros activos aplicados
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabla Profesional */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 pl-5 pr-3">Código</th>
                <th className="py-3.5 px-3">Incidencia / Reportante</th>
                <th className="py-3.5 px-3">Categoría</th>
                <th className="py-3.5 px-3">Prioridad</th>
                <th className="py-3.5 px-3">Estado</th>
                <th className="py-3.5 px-3">Técnico Asignado</th>
                <th className="py-3.5 px-3">1ra Respuesta</th>
                <th className="py-3.5 pl-3 pr-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Cargando incidencias...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    No se encontraron incidencias que coincidan con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                tickets.map((tk) => (
                  <tr key={tk.id} className="hover:bg-slate-50/90 transition">
                    <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">
                      <Link
                        to={`/tickets/${tk.id}`}
                        className="font-mono font-bold text-blue-700 hover:underline block"
                      >
                        {tk.code}
                      </Link>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {formatDateTime(tk.createdAt)}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 max-w-sm">
                      <Link
                        to={`/tickets/${tk.id}`}
                        className="font-bold text-slate-900 hover:text-blue-700 line-clamp-1"
                      >
                        {tk.subject}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                        <span>{tk.reporter.fullName}</span>
                        <span>•</span>
                        <span>{tk.department.name}</span>
                        {tk.workstationCode && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-700">
                            {tk.workstationCode}
                          </span>
                        )}
                      </div>
                      {(tk.commentsCount > 0 || tk.attachmentsCount > 0) && (
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
                          {tk.commentsCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> {tk.commentsCount}
                            </span>
                          )}
                          {tk.attachmentsCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" /> {tk.attachmentsCount}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <CategoryBadge code={tk.category.code} name={tk.category.name} />
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[130px]">
                        {tk.incidentType}
                      </p>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <PriorityBadge priority={tk.priority} />
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <StatusBadge status={tk.status} />
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {tk.assignedTechnician ? (
                        <div>
                          <p className="font-semibold text-slate-800">{tk.assignedTechnician.fullName}</p>
                          <p className="text-[10px] text-slate-400">
                            Nivel {tk.assignedTechnician.supportLevel}
                          </p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          Sin asignar
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {tk.firstResponseMinutes !== null ? (
                        <span
                          className={`font-semibold ${
                            tk.firstResponseMinutes <= tk.category.slaResponseMinutes
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {formatDurationMinutes(tk.firstResponseMinutes)}
                        </span>
                      ) : (
                        <span className="text-slate-400">En espera</span>
                      )}
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                      <Link
                        to={`/tickets/${tk.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Detalle
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-600">
            <span>
              Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalItems} registros)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
