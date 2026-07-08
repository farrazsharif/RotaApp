import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/axios';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
}

export interface SignupData {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// Where each role's app lives. Carers → carer app, family → family portal;
// managers/admins (null) stay in this portal. Works on prod domains and local.
function appUrlForRole(role: string): string | null {
  const prod = window.location.hostname.endsWith('caremid.co.uk');
  if (role === 'EMPLOYEE') return prod ? 'https://carer.caremid.co.uk' : 'http://localhost:5174';
  if (role === 'FAMILY_MEMBER') return prod ? 'https://family.caremid.co.uk' : 'http://localhost:5175';
  return null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;
    // Carers and family members belong in their own apps, not the manager
    // portal. Hand the session over so they don't have to log in twice.
    const dest = appUrlForRole(newUser.role);
    if (dest) {
      window.location.replace(`${dest}/login?sso=${encodeURIComponent(newToken)}`);
      return;
    }
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  }

  async function signup(data: SignupData) {
    const res = await api.post('/auth/signup', data);
    const { token: newToken, user: newUser } = res.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    const res = await api.get('/auth/me');
    setUser(res.data);
  }

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, refreshUser, loading, isAdmin, isManager }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
