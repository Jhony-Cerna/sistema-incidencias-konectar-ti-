import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { DepartmentOption, RoleCode, UserRecord } from '../types';
import { formatDateTime } from '../utils/formatters';

export function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal Crear / Editar Usuario
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [roleCode, setRoleCode] = useState<RoleCode>('COLABORADOR');
  const [departmentId, setDepartmentId] = useState<number>(1);
  const [specialty, setSpecialty] = useState('Soporte de Usuarios Nivel 1 & 2');
  const [specialtyCategoryCode, setSpecialtyCategoryCode] = useState<
    'HARDWARE' | 'SOFTWARE' | 'CONECTIVIDAD' | 'GENERAL'
  >('GENERAL');
  const [supportLevel, setSupportLevel] = useState<'N1' | 'N2'>('N1');
  const [maxConcurrentTickets, setMaxConcurrentTickets] = useState<number>(8);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { departments: DepartmentOption[] } }>('/api/catalogs')
      .then((res) => {
        setDepartments(res.data.departments);
        if (res.data.departments.length > 0) {
          setDepartmentId(res.data.departments[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (roleFilter) qs.set('role', roleFilter);
      if (statusFilter) qs.set('status', statusFilter);

      const res = await api.get<{ success: boolean; data: UserRecord[] }>(
        `/api/users?${qs.toString()}`
      );
      setUsers(res.data);
    } catch (err: any) {
      showToast(err.message || 'Error al cargar usuarios.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setRoleCode('COLABORADOR');
    setDepartmentId(departments[0]?.id || 1);
    setSpecialty('Soporte de Usuarios Nivel 1 & 2');
    setSpecialtyCategoryCode('GENERAL');
    setSupportLevel('N1');
    setMaxConcurrentTickets(8);
    setModalOpen(true);
  };

  const openEditModal = (u: UserRecord) => {
    setEditingUser(u);
    setFullName(u.fullName);
    setEmail(u.email);
    setPassword('');
    setPhone(u.phone || '');
    setRoleCode(u.role);
    setDepartmentId(u.departmentId);
    if (u.technician) {
      setSpecialty(u.technician.specialty);
      setSpecialtyCategoryCode(
        (u.technician.specialtyCategoryCode as 'HARDWARE' | 'SOFTWARE' | 'CONECTIVIDAD' | 'GENERAL') ||
          'GENERAL'
      );
      setSupportLevel(u.technician.supportLevel || 'N1');
      setMaxConcurrentTickets(u.technician.maxConcurrentTickets || 8);
    } else {
      setSpecialty('Soporte de Usuarios Nivel 1 & 2');
      setSpecialtyCategoryCode('GENERAL');
      setSupportLevel('N1');
      setMaxConcurrentTickets(8);
    }
    setModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        roleCode,
        departmentId,
      };
      if (!editingUser || password.trim().length > 0) {
        payload.password = password;
      }
      if (roleCode === 'TECNICO') {
        payload.specialty = specialty.trim();
        payload.specialtyCategoryCode = specialtyCategoryCode;
        payload.supportLevel = supportLevel;
        payload.maxConcurrentTickets = maxConcurrentTickets;
      }

      if (editingUser) {
        await api.put(`/api/users/${editingUser.id}`, payload);
        showToast('Usuario actualizado exitosamente.', 'success');
      } else {
        await api.post('/api/users', payload);
        showToast('Nuevo usuario corporativo creado.', 'success');
      }

      setModalOpen(false);
      await fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'No se pudo guardar el usuario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (u: UserRecord) => {
    if (u.id === currentUser?.id) {
      showToast('No puede desactivar su propia cuenta en sesión.', 'warning');
      return;
    }
    try {
      const res = await api.patch<{ success: boolean; message: string }>(
        `/api/users/${u.id}/status`,
        { isActive: !u.isActive }
      );
      showToast(res.message, 'success');
      await fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar estado de cuenta.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Gestión de Usuarios y Especialistas TI
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Administración de cuentas corporativas, perfiles RBAC, técnicos y estado de acceso.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchUsers}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-konectar-800 transition cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Registrar Usuario
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o código KON..."
            className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="sm:col-span-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="">Todos los roles</option>
            <option value="ADMIN">Administrador TI</option>
            <option value="TECNICO">Técnico de Soporte TI</option>
            <option value="COLABORADOR">Colaborador</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="">Cualquier estado</option>
            <option value="ACTIVE">Cuentas Activas</option>
            <option value="INACTIVE">Cuentas Desactivadas</option>
          </select>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 pl-5 pr-3">Código / Usuario</th>
                <th className="py-3.5 px-3">Rol del Sistema</th>
                <th className="py-3.5 px-3">Área / Especialidad</th>
                <th className="py-3.5 px-3">Estado</th>
                <th className="py-3.5 px-3">Último Acceso</th>
                <th className="py-3.5 pl-3 pr-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 pl-5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                        {u.employeeCode}
                      </span>
                      <span className="font-bold text-slate-900">{u.fullName}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {u.email} {u.phone ? `• ${u.phone}` : ''}
                    </p>
                  </td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                        u.role === 'ADMIN'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : u.role === 'TECNICO'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {u.role === 'ADMIN' ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : u.role === 'TECNICO' ? (
                        <Wrench className="h-3 w-3" />
                      ) : null}
                      {u.roleName}
                    </span>
                  </td>
                  <td className="py-3.5 px-3">
                    <p className="font-semibold text-slate-800">{u.departmentName}</p>
                    {u.technician && (
                      <p className="text-[11px] text-blue-700">
                        Nivel {u.technician.supportLevel} • {u.technician.specialty} (Máx:{' '}
                        {u.technician.maxConcurrentTickets})
                      </p>
                    )}
                  </td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                        Desactivado
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-slate-500 whitespace-nowrap">
                    {formatDateTime(u.lastLoginAt)}
                  </td>
                  <td className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap space-x-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      disabled={u.id === currentUser?.id}
                      onClick={() => handleToggleStatus(u)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-30 ${
                        u.isActive
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {u.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Registro / Edición */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? `Editar Usuario: ${editingUser.employeeCode}` : 'Registrar Nuevo Usuario Corporativo'}
        subtitle="Configure los datos personales, departamento y permisos por rol"
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. María Fernanda Salazar"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Correo Electrónico *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@konectarbpo.com"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teléfono / Anexo
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="999-000-111"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rol de Acceso *
              </label>
              <select
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value as RoleCode)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="COLABORADOR">Colaborador</option>
                <option value="TECNICO">Técnico de Soporte TI</option>
                <option value="ADMIN">Administrador TI</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Área / Departamento *
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {editingUser
                  ? 'Nueva Contraseña (dejar en blanco para conservar la actual)'
                  : 'Contraseña Inicial *'}
              </label>
              <input
                type="password"
                required={!editingUser}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres seguros"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Parámetros adicionales para Técnico de Soporte TI */}
          {roleCode === 'TECNICO' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
              <p className="text-xs font-bold text-blue-950">
                Configuración Operativa del Técnico de Soporte TI
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Especialidad Técnica
                  </label>
                  <input
                    type="text"
                    required
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Afinidad de Categoría Automática
                  </label>
                  <select
                    value={specialtyCategoryCode}
                    onChange={(e) => setSpecialtyCategoryCode(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  >
                    <option value="GENERAL">General (Todas las categorías)</option>
                    <option value="HARDWARE">Hardware y Periféricos</option>
                    <option value="SOFTWARE">Software, CRM y Accesos</option>
                    <option value="CONECTIVIDAD">Conectividad, Redes y VoIP</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nivel</label>
                    <select
                      value={supportLevel}
                      onChange={(e) => setSupportLevel(e.target.value as 'N1' | 'N2')}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="N1">Nivel 1</option>
                      <option value="N2">Nivel 2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tope Activos
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={maxConcurrentTickets}
                      onChange={(e) => setMaxConcurrentTickets(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-konectar-700 px-5 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
