import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  clearStoredSession,
  getAccessToken,
  getSessionGeneration,
  assertSessionGeneration,
  refreshAccessToken,
  setSessionAccessToken,
  TOKEN_CHANGED_EVENT,
  UNAUTHORIZED_EVENT,
} from '../auth/authSession';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  initial_balance: number;
  currency: string;
  /** Sunucudaki ADMIN_EMAILS listesine göre hesaplanır; yalnızca arayüz ipucudur. */
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearSession = () => {
    clearStoredSession();
    setUser(null);
  };

  // Herhangi bir API çağrısı 401 dönerse oturumu düşür ve giriş ekranına dön.
  useEffect(() => {
    const handleUnauthorized = () => {
      setAccessToken(null);
      setUser(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  useEffect(() => {
    const handleTokenChanged = (event: Event) => {
      setAccessToken((event as CustomEvent<string | null>).detail);
    };
    window.addEventListener(TOKEN_CHANGED_EVENT, handleTokenChanged);
    return () => window.removeEventListener(TOKEN_CHANGED_EVENT, handleTokenChanged);
  }, []);

  // Sayfa açıldığında httpOnly cookie ile oturumu yeniden kur.
  useEffect(() => {
    const initAuth = async () => {
      const generation = getSessionGeneration();
      // Önceki sürümlerden kalan okunabilir token/kullanıcı kopyalarını temizle.
      localStorage.removeItem('replay_access_token');
      localStorage.removeItem('replay_auth_token');
      localStorage.removeItem('replay_user');
      try {
        const token = await refreshAccessToken();
        assertSessionGeneration(generation);
        if (token) {
          const userRes = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (userRes.ok) {
            const restoredUser = await userRes.json();
            assertSessionGeneration(generation);
            setUser(restoredUser);
          } else {
            assertSessionGeneration(generation);
            setIsLoading(false);
            clearStoredSession();
          }
        }
      } catch (err) {
        console.error("Auth init silent refresh failed:", err);
      } finally {
        if (generation === getSessionGeneration()) setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const loginWithGoogle = async (credential: string) => {
    clearSession();
    const generation = getSessionGeneration();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ credential })
      });

      if (!res.ok) {
        // Gövde her zaman JSON değil: Vite dev proxy backend'e ulaşamadığında
        // düz metin bir 500 döndürüyor ve `res.json()` burada SyntaxError
        // fırlatıyordu — kullanıcı giriş ekranında "Unexpected token" görüyordu.
        let detail = '';
        try {
          detail = (await res.json())?.detail ?? '';
        } catch {
          detail = '';
        }
        if (!detail && res.status >= 500) {
          detail = 'Sunucuya ulaşılamadı. Backend çalışıyor mu?';
        }
        throw new Error(detail || `Giriş başarısız (HTTP ${res.status})`);
      }

      const data = await res.json();
      assertSessionGeneration(generation);
      setSessionAccessToken(data.access_token);
      setUser(data.user);
    } finally {
      if (generation === getSessionGeneration()) setIsLoading(false);
    }
  };

  const logout = async () => {
    const token = getAccessToken();
    clearSession();
    setIsLoading(false);
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token
          ? { 'Authorization': `Bearer ${token}` }
          : undefined,
      });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!accessToken && !!user,
        isLoading,
        loginWithGoogle,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
