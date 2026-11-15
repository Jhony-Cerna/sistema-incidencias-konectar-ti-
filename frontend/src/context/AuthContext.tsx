import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../services/api';
import { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get<{ success: boolean; data: AuthUser }>('/api/auth/me');
      setUser(res.data);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('konectar:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('konectar:unauthorized', handleUnauthorized);
  }, [refreshUser]);

  // Actualización periódica ligera de sesión y contador de notificaciones en tiempo real
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshUser();
    }, 25000);
    return () => clearInterval(interval);
  }, [user, refreshUser]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await api.post<{
      success: boolean;
      data: { token: string; user: AuthUser };
    }>('/api/auth/login', { email, password });

    setStoredToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Continuar limpieza local incluso si el servidor no responde
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return ctx;
}
