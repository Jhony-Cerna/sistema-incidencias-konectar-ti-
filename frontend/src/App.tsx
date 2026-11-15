import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { MainLayout } from './components/layout/MainLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { CreateTicketPage } from './pages/CreateTicketPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsKpiPage } from './pages/ReportsKpiPage';
import { SettingsPage } from './pages/SettingsPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { TicketsListPage } from './pages/TicketsListPage';
import { UsersManagementPage } from './pages/UsersManagementPage';
import { RoleCode } from './types';

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: RoleCode[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-semibold">Validando sesión corporativa...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/tickets" element={<TicketsListPage />} />
              <Route
                path="/tickets/nuevo"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'COLABORADOR']}>
                    <CreateTicketPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route
                path="/base-conocimiento"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'TECNICO']}>
                    <TicketsListPage knowledgeMode />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/asignaciones"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AssignmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reportes"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'TECNICO']}>
                    <ReportsKpiPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <UsersManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/notificaciones" element={<NotificationsPage />} />
              <Route
                path="/configuracion"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/perfil" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
