import React, { useCallback, useEffect, useState } from 'react';
import { Save, ShieldAlert, Sliders } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { CategoryOption } from '../types';
import { formatDateTime } from '../utils/formatters';

interface AuditLogRecord {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  userName: string;
  employeeCode: string | null;
}

export function SettingsPage() {
  const { showToast } = useToast();

  const [autoAssignEnabled, setAutoAssignEnabled] = useState<'true' | 'false'>('true');
  const [autoAssignStrategy, setAutoAssignStrategy] = useState<
    'SPECIALTY_AND_WORKLOAD' | 'LEAST_WORKLOAD'
  >('SPECIALTY_AND_WORKLOAD');
  const [companySiteName, setCompanySiteName] = useState('KONECTAR BPO S.A.C. - Sede Lima Norte');
  const [supportEmail, setSupportEmail] = useState('soporte.ti@konectarbpo.com');

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingCatId, setSavingCatId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [setRes, catRes] = await Promise.all([
        api.get<{
          success: boolean;
          data: { settings: Record<string, string>; auditLogs: AuditLogRecord[] };
        }>('/api/settings'),
        api.get<{ success: boolean; data: CategoryOption[] }>('/api/categories'),
      ]);

      const s = setRes.data.settings;
      setAutoAssignEnabled(s.auto_assign_enabled === 'false' ? 'false' : 'true');
      setAutoAssignStrategy(
        s.auto_assign_strategy === 'LEAST_WORKLOAD' ? 'LEAST_WORKLOAD' : 'SPECIALTY_AND_WORKLOAD'
      );
      if (s.company_site_name) setCompanySiteName(s.company_site_name);
      if (s.support_email) setSupportEmail(s.support_email);

      setAuditLogs(setRes.data.auditLogs);
      setCategories(catRes.data);
    } catch (err: any) {
      showToast(err.message || 'Error al cargar configuración.', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      await api.put('/api/settings', {
        auto_assign_enabled: autoAssignEnabled,
        auto_assign_strategy: autoAssignStrategy,
        company_site_name: companySiteName.trim(),
        support_email: supportEmail.trim(),
      });
      await loadAll();
      showToast('Parámetros generales actualizados correctamente.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar configuración.', 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleUpdateCategorySla = async (cat: CategoryOption) => {
    setSavingCatId(cat.id);
    try {
      await api.put(`/api/categories/${cat.id}`, {
        description: cat.description,
        slaResponseMinutes: cat.slaResponseMinutes ?? cat.sla_response_minutes ?? 15,
        slaResolutionMinutes: cat.slaResolutionMinutes ?? cat.sla_resolution_minutes ?? 120,
      });
      showToast(`SLA de la categoría ${cat.name} actualizado.`, 'success');
      await loadAll();
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar categoría.', 'error');
    } finally {
      setSavingCatId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Configuración General y Registro de Auditoría TI
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Parámetros operativos de asignación automática, metas SLA por categoría y bitácora de seguridad.
        </p>
      </div>

      {/* Parámetros del Motor de Asignación e Identidad */}
      <form
        onSubmit={handleSaveGeneral}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Sliders className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">Reglas Operativas del Sistema</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Asignación Automática al Registrar Ticket
            </label>
            <select
              value={autoAssignEnabled}
              onChange={(e) => setAutoAssignEnabled(e.target.value as 'true' | 'false')}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="true">Habilitada (Distribución automática inmediata)</option>
              <option value="false">Deshabilitada (Recepción en cola para asignación manual)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Algoritmo de Balanceo de Carga
            </label>
            <select
              value={autoAssignStrategy}
              onChange={(e) =>
                setAutoAssignStrategy(
                  e.target.value as 'SPECIALTY_AND_WORKLOAD' | 'LEAST_WORKLOAD'
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="SPECIALTY_AND_WORKLOAD">
                Priorizar Especialidad por Categoría + Menor Carga Activa
              </option>
              <option value="LEAST_WORKLOAD">Menor Carga Activa Global (Round-Robin)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Sede Institucional
            </label>
            <input
              type="text"
              value={companySiteName}
              onChange={(e) => setCompanySiteName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Correo de Mesa de Ayuda TI
            </label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingGeneral}
            className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-5 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {savingGeneral ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </form>

      {/* Acuerdos de Nivel de Servicio (SLA) por Categoría */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Metas SLA por Categoría Tecnológica (KPI 1 y Resolución)
          </h2>
          <p className="text-xs text-slate-500">
            Umbrales de referencia empleados en la evaluación del Tiempo de Primera Respuesta.
          </p>
        </div>

        <div className="space-y-3">
          {categories.map((cat, idx) => (
            <div
              key={cat.id}
              className="grid grid-cols-1 md:grid-cols-12 items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="md:col-span-5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {cat.name} ({cat.code})
                </label>
                <input
                  type="text"
                  value={cat.description}
                  onChange={(e) => {
                    const copy = [...categories];
                    copy[idx] = { ...cat, description: e.target.value };
                    setCategories(copy);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Meta 1ra Respuesta (min)
                </label>
                <input
                  type="number"
                  min={1}
                  value={cat.slaResponseMinutes ?? cat.sla_response_minutes ?? 15}
                  onChange={(e) => {
                    const copy = [...categories];
                    copy[idx] = { ...cat, slaResponseMinutes: Number(e.target.value) };
                    setCategories(copy);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Meta Cierre (min)
                </label>
                <input
                  type="number"
                  min={5}
                  value={cat.slaResolutionMinutes ?? cat.sla_resolution_minutes ?? 120}
                  onChange={(e) => {
                    const copy = [...categories];
                    copy[idx] = { ...cat, slaResolutionMinutes: Number(e.target.value) };
                    setCategories(copy);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div className="md:col-span-2 text-right">
                <button
                  type="button"
                  disabled={savingCatId === cat.id}
                  onClick={() => handleUpdateCategorySla(cat)}
                  className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                >
                  {savingCatId === cat.id ? '...' : 'Actualizar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bitácora de Auditoría y Seguridad */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-bold text-slate-900">
            Bitácora de Auditoría de Acciones Relevantes (Últimos 50 eventos)
          </h2>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-2 pr-3">Fecha / Hora</th>
                <th className="py-2 px-2">Usuario</th>
                <th className="py-2 px-2">Acción</th>
                <th className="py-2 px-2">Entidad</th>
                <th className="py-2 pl-2">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="py-2.5 px-2 font-semibold text-slate-800 whitespace-nowrap">
                    {log.userName}
                  </td>
                  <td className="py-2.5 px-2 font-mono text-[11px] font-bold text-blue-700 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                    {log.entity} {log.entityId ? `#${log.entityId}` : ''}
                  </td>
                  <td className="py-2.5 pl-2 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                    {log.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
