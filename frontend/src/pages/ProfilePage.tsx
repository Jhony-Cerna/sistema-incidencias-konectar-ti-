import React, { useState } from 'react';
import { KeyRound, Save, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  if (!user) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/api/auth/profile', {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
      });
      await refreshUser();
      showToast('Datos de contacto actualizados correctamente.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar perfil.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('La nueva contraseña debe tener al menos 6 caracteres.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('La confirmación de la nueva contraseña no coincide.', 'warning');
      return;
    }

    setSavingPass(true);
    try {
      await api.patch('/api/auth/password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Contraseña actualizada con éxito.', 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo cambiar la contraseña.', 'error');
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Mi Perfil Corporativo y Seguridad
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Consulte su información institucional y gestione el cambio seguro de su contraseña.
        </p>
      </div>

      {/* Información Institucional */}
      <form
        onSubmit={handleUpdateProfile}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Información del Colaborador</h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            <ShieldCheck className="h-3.5 w-3.5" /> {user.roleName}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Código Corporativo
            </label>
            <input
              type="text"
              disabled
              value={user.employeeCode}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-mono text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Correo Institucional
            </label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nombre Completo *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Teléfono / Anexo de Contacto
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 999-111-222"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-200/70">
            <strong>Área asignada:</strong> {user.departmentName} ({user.departmentSite})
            {user.specialty && (
              <span className="block mt-1">
                <strong>Especialidad TI:</strong> {user.specialty} (Nivel {user.supportLevel})
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-5 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {savingProfile ? 'Guardando...' : 'Actualizar Datos'}
          </button>
        </div>
      </form>

      {/* Cambio Seguro de Contraseña */}
      <form
        onSubmit={handleChangePassword}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <KeyRound className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-bold text-slate-900">Actualizar Contraseña de Acceso</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Contraseña Actual *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nueva Contraseña *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirmar Nueva Contraseña *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPass}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            {savingPass ? 'Actualizando...' : 'Cambiar Contraseña'}
          </button>
        </div>
      </form>
    </div>
  );
}
