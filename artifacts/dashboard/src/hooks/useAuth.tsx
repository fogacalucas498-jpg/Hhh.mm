import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, User, onSessionExpired } from '@/lib/api';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const d = await api.get<{ user: User }>('/auth/me');
    setUser(d.user);
  };

  useEffect(() => {
    fetchUser()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return onSessionExpired(() => setUser(null));
  }, []);

  const login = async (email: string, password: string) => {
    const d = await api.post<{ user: User }>('/auth/login', { email, password });
    setUser(d.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const d = await api.post<{ user: User }>('/auth/register', { email, password, name });
    setUser(d.user);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const refreshUser = async () => {
    const d = await api.get<{ user: User }>('/auth/me');
    setUser(d.user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
