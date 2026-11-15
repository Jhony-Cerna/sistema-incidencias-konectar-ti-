import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const { user, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Por favor ingrese su correo corporativo y contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedUser = await login(email.trim(), password);
      showToast(`Bienvenido(a), ${loggedUser.fullName}`, 'success');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-950">
      {/* Panel Corporativo Izquierdo */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-12 bg-gradient-to-br from-konectar-950 via-konectar-900 to-blue-900 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-konectar-950 font-black text-2xl shadow-xl">
              K
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight">KONECTAR BPO S.A.C.</span>
                <span className="rounded-md bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 text-xs font-bold text-amber-300">
                  Sede Lima Norte
                </span>
              </div>
              <p className="text-xs text-slate-300">Área de Sistemas y Soporte Tecnológico Interno</p>
            </div>
          </div>

          <div className="mt-14 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 border border-blue-400/30 px-3.5 py-1 text-xs font-semibold text-sky-200">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              Plataforma ITSM / Mesa de Ayuda Corporativa
            </span>
            <h1 className="mt-5 text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight">
              Sistema Web de Gestión y Seguimiento de Incidencias TI
            </h1>
            <p className="mt-4 text-slate-300 text-sm leading-relaxed">
              Centralización estructurada de requerimientos tecnológicos de Hardware, Software y
              Conectividad para garantizar la continuidad operativa de las campañas y áreas corporativas.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                'Códigos únicos correlativos y trazabilidad ACID sin pérdida de registros',
                'Asignación inteligente por especialidad y carga laboral en tiempo real',
                'Control de estados (Pendiente, En proceso, Resuelto) con historial auditable',
                'Monitoreo automático de KPIs: Tiempo de Primera Respuesta y Tasa de Resolución',
              ].map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl bg-white/5 border border-white/10 p-3.5"
                >
                  <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-200 leading-snug">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-400">
          <span>RUC N.° 20609998947 • KONECTAR BPO S.A.C.</span>
          <span>Soporte TI • Continuidad Operativa</span>
        </div>
      </div>

      {/* Formulario de Autenticación Derecho */}
      <div className="col-span-12 lg:col-span-6 xl:col-span-5 flex items-center justify-center bg-white p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md space-y-7">
          {/* Encabezado móvil */}
          <div className="lg:hidden flex items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-konectar-900 text-amber-400 font-black text-xl">
              K
            </div>
            <div>
              <p className="font-extrabold text-slate-900 text-base">KONECTAR BPO S.A.C.</p>
              <p className="text-xs text-slate-500">Sistema de Incidencias - Soporte TI</p>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 mb-3">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              Acceso Seguro Corporativo
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Iniciar Sesión en Mesa de Ayuda
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ingrese sus credenciales institucionales para acceder a la plataforma de Soporte TI.
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Correo Electrónico Corporativo
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@konectarbpo.com"
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-10 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-konectar-800 py-3 px-4 text-sm font-bold text-white shadow-md hover:bg-konectar-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-60 transition cursor-pointer"
            >
              {submitting ? 'Verificando credenciales...' : 'Ingresar al Sistema'}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
            <Building2 className="h-5 w-5 text-konectar-700 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 leading-relaxed">
              <p className="font-bold text-slate-800">Soporte Interno KONECTAR BPO S.A.C.</p>
              <p className="mt-0.5">
                Si requiere habilitación de acceso o restablecimiento de credenciales, comuníquese con la
                administración del Área de Sistemas (Sede Lima Norte).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
