import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/axios';
import { User } from '../types';

// Returned when the credentials are valid but belong to a non-portal app
// (a carer or family member trying the manager portal).
export interface WrongApp {
  app: 'carer' | 'family';
  url: string;   // destination app base URL
  token: string; // their session token, for a one-tap handoff
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<WrongApp | null>;
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
    // Carers and family members don't belong in the manager portal. Don't log
    // them in here — signal the Login page to show a "use the other app"
    // message with a one-tap handoff button (so they don't re-enter details).
    const dest = appUrlForRole(newUser.role);
    if (dest) {
      const app: WrongApp['app'] = newUser.role === 'EMPLOYEE' ? 'carer' : 'family';
      return { app, url: dest, token: newToken };
    }
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    return null;
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
