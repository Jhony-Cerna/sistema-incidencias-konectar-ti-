import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AppWindow,
  ArrowLeft,
  Cpu,
  FileUp,
  Send,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { CategoryOption, DepartmentOption, TechnicianWorkload, TicketPriority, UserRecord } from '../types';
import { formatBytes } from '../utils/formatters';

const INCIDENT_TYPES_BY_CATEGORY: Record<string, string[]> = {
  HARDWARE: [
    'Falla operativa de equipo o periférico',
    'Diadema / Headset sin audio o micrófono',
    'Falla de monitor o señal de video',
    'Mantenimiento correctivo / sobrecalentamiento',
    'Reemplazo de teclado o mouse',
  ],
  SOFTWARE: [
    'Bloqueo o falla en CRM corporativo',
    'Acceso, credenciales y cuentas de usuario',
    'Error en aplicativo interno (Validación / Backdata)',
    'Instalación o actualización de software homologado',
    'Requerimiento de configuración de estación',
  ],
  CONECTIVIDAD: [
    'Falla en extensión VoIP / Softphone SIP',
    'Interrupción de red cableada LAN',
    'Degradación o latencia de Internet / Fibra',
    'Acceso a VPN o carpetas compartidas en red',
    'Configuración de red o DNS corporativo',
  ],
};

export function CreateTicketPage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianWorkload[]>([]);

  const [categoryId, setCategoryId] = useState<number>(0);
  const [incidentType, setIncidentType] = useState<string>('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIA');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [workstationCode, setWorkstationCode] = useState('');
  const [departmentId, setDepartmentId] = useState<number>(user?.departmentId || 0);
  const [reporterId, setReporterId] = useState<number>(user?.id || 0);
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const res = await api.get<{
          success: boolean;
          data: { categories: CategoryOption[]; departments: DepartmentOption[] };
        }>('/api/catalogs');
        setCategories(res.data.categories);
        setDepartments(res.data.departments);

        if (res.data.categories.length > 0) {
          const firstCat = res.data.categories[0];
          setCategoryId(firstCat.id);
          const types = INCIDENT_TYPES_BY_CATEGORY[firstCat.code] || ['Falla operativa'];
          setIncidentType(types[0]);
        }

        if (user?.role === 'ADMIN') {
          const [uRes, tRes] = await Promise.all([
            api.get<{ success: boolean; data: UserRecord[] }>('/api/users?status=ACTIVE'),
            api.get<{ success: boolean; data: { technicians: TechnicianWorkload[] } }>('/api/technicians'),
          ]);
          setUsersList(uRes.data);
          setTechnicians(tRes.data.technicians.filter((t) => t.isUserActive));
        }
      } catch (err: any) {
        showToast(err.message || 'Error al cargar catálogos del formulario.', 'error');
      }
    };
    loadCatalogs();
  }, [user?.role, showToast]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const availableIncidentTypes = selectedCategory
    ? INCIDENT_TYPES_BY_CATEGORY[selectedCategory.code] || ['Falla operativa']
    : ['Falla operativa'];

  const handleCategoryChange = (cat: CategoryOption) => {
    setCategoryId(cat.id);
    const types = INCIDENT_TYPES_BY_CATEGORY[cat.code] || ['Falla operativa'];
    setIncidentType(types[0]);
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    const next = [...files, ...selected].slice(0, 4);
    const oversized = next.find((f) => f.size > 5 * 1024 * 1024);
    if (oversized) {
      showToast(`El archivo ${oversized.name} supera el límite máximo de 5 MB.`, 'warning');
      return;
    }
    setFiles(next);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!categoryId) {
      setFormError('Seleccione una categoría de incidencia.');
      return;
    }
    if (subject.trim().length < 5) {
      setFormError('El asunto debe contener al menos 5 caracteres descriptivos.');
      return;
    }
    if (description.trim().length < 10) {
      setFormError('Describa detalladamente el problema tecnológico (mínimo 10 caracteres).');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('categoryId', String(categoryId));
      formData.append('incidentType', incidentType);
      formData.append('priority', priority);
      formData.append('subject', subject.trim());
      formData.append('description', description.trim());
      if (workstationCode.trim()) {
        formData.append('workstationCode', workstationCode.trim().toUpperCase());
      }
      if (departmentId) {
        formData.append('departmentId', String(departmentId));
      }
      if (user?.role === 'ADMIN' && reporterId) {
        formData.append('reporterId', String(reporterId));
      }
      if (user?.role === 'ADMIN' && assignedTechnicianId) {
        formData.append('assignedTechnicianId', assignedTechnicianId);
      }
      for (const file of files) {
        formData.append('attachments', file);
      }

      const res = await api.post<{
        success: boolean;
        message: string;
        data: { id: number; code: string; assignedTechnicianName: string | null };
      }>('/api/tickets', formData);

      await refreshUser();
      showToast(
        res.data.assignedTechnicianName
          ? `Ticket ${res.data.code} creado y asignado a ${res.data.assignedTechnicianName}.`
          : `Ticket ${res.data.code} registrado exitosamente.`,
        'success'
      );
      navigate(`/tickets/${res.data.id}`);
    } catch (err: any) {
      setFormError(err.message || 'No se pudo registrar la incidencia.');
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryIcon = (code: string) => {
    if (code === 'HARDWARE') return Cpu;
    if (code === 'SOFTWARE') return AppWindow;
    return Wifi;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/tickets"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al listado de incidencias
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Registrar Nueva Incidencia Tecnológica
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Complete la información estructurada para generar su código único de atención en Soporte TI.
          </p>
        </div>
      </div>

      {formError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Paso 1: Categoría Tecnológica */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">1. Seleccione la Categoría Principal</h2>
            <p className="text-xs text-slate-500">
              Permite dirigir el ticket automáticamente al especialista de Soporte TI adecuado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {categories.map((cat) => {
              const Icon = getCategoryIcon(cat.code);
              const selected = cat.id === categoryId;
              const slaResp = cat.sla_response_minutes ?? cat.slaResponseMinutes ?? 15;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={`flex flex-col text-left rounded-xl border p-4 transition cursor-pointer ${
                    selected
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`rounded-lg p-2 ${
                        selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      SLA 1ra resp: {slaResp} min
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">{cat.name}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {cat.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Paso 2: Clasificación y Detalles del Problema */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">2. Detalle Operativo de la Incidencia</h2>
            <p className="text-xs text-slate-500">
              Especifique el tipo de requerimiento, prioridad e identificación de su estación.
            </p>
          </div>

          {user?.role === 'ADMIN' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Usuario que Reporta (Modo Administrador)
                </label>
                <select
                  value={reporterId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setReporterId(id);
                    const found = usersList.find((u) => u.id === id);
                    if (found) setDepartmentId(found.departmentId);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.departmentName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Asignación Inicial de Técnico
                </label>
                <select
                  value={assignedTechnicianId}
                  onChange={(e) => setAssignedTechnicianId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Automática según configuración y carga</option>
                  {technicians.map((t) => (
                    <option key={t.technicianId} value={t.technicianId}>
                      {t.fullName} ({t.activeLoad}/{t.maxConcurrentTickets} activos • {t.supportLevel})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tipo de Incidencia *
              </label>
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {availableIncidentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Prioridad / Impacto Operativo *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="BAJA">Baja — Consulta o ajuste menor sin detener labores</option>
                <option value="MEDIA">Media — Afectación parcial con alternativa temporal</option>
                <option value="ALTA">Alta — Interrumpe funciones operativas del puesto</option>
                <option value="CRITICA">Crítica — Paralización de campaña / múltiples usuarios</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Área o Departamento *
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.site})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Código de Estación / Anexo VoIP (Opcional)
              </label>
              <input
                type="text"
                value={workstationCode}
                onChange={(e) => setWorkstationCode(e.target.value)}
                placeholder="Ej. PC-VEN-014 o Anexo 4108"
                maxLength={40}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Asunto Breve de la Incidencia *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej. Sin retorno de micrófono en diadema USB durante llamadas CRM"
              maxLength={180}
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Descripción Detallada del Problema *
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Indique qué ocurría al presentarse la falla, mensajes de error en pantalla y pruebas básicas realizadas..."
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Adjuntos / Evidencias */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Evidencias o Archivos Adjuntos (Opcional • Máx. 4 archivos de 5 MB)
            </label>
            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-center hover:border-blue-500 hover:bg-blue-50/30 transition cursor-pointer">
              <FileUp className="h-6 w-6 text-slate-400 mb-1.5" />
              <span className="text-xs font-semibold text-slate-700">
                Haga clic para adjuntar capturas de pantalla, logs o documentos PDF
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">
                Formatos soportados: PNG, JPG, WEBP, PDF, TXT, LOG, Word, Excel
              </span>
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.log,.doc,.docx,.xls,.xlsx"
                onChange={handleFilesChange}
                className="hidden"
              />
            </label>

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="truncate pr-3">
                      <span className="font-semibold text-slate-800">{f.name}</span>
                      <span className="ml-2 text-slate-400">({formatBytes(f.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-rose-600 hover:text-rose-800 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex items-center justify-end gap-3">
          <Link
            to="/tickets"
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-konectar-700 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-konectar-800 disabled:opacity-60 transition cursor-pointer"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Registrando Incidencia...' : 'Generar Ticket de Soporte TI'}
          </button>
        </div>
      </form>
    </div>
  );
}
