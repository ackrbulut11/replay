import React, { createContext, useContext, useState, useEffect } from 'react';

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
  loginDemoUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://replay-xj3e.onrender.com/api' : '/api');

// Oturuma ait tüm localStorage anahtarları tek yerde tanımlı.
// `replay_auth_token` artık yazılmıyor; eski oturumlardan kalmış olabileceği
// için temizlik listesinde tutuluyor (aksi halde çıkıştan sonra bile
// eski kimlikle istek gidebiliyordu).
// Test geçmişi ve strateji sıralaması da kullanıcıya özeldir: silinmezlerse
// aynı tarayıcıda giriş yapan bir sonraki kullanıcı öncekinin verisini görür.
const SESSION_KEYS = [
  'replay_access_token',
  'replay_auth_token',
  'replay_user',
  'replay_single_eval_history',
  'replay_strategy_order',
  'replay_watchlists_v2',
];

export const TOKEN_STORAGE_KEY = 'replay_access_token';

/** API katmanı 401 aldığında yayınlanır; AuthProvider dinleyip oturumu düşürür. */
export const UNAUTHORIZED_EVENT = 'replay:unauthorized';

/**
 * Oturum temizlendiğinde yayınlanır. Store'lar kullanıcıya özel durumlarını
 * bununla sıfırlar. Doğrudan import yerine event kullanılıyor: aksi halde
 * AuthContext -> store -> services/api -> AuthContext döngüsü oluşuyor.
 */
export const SESSION_CLEARED_EVENT = 'replay:session-cleared';

/** Oturum verisini tarayıcıdan tamamen siler. */
export function clearStoredSession(): void {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  // Store'lar kullanıcıya özel durumlarını sıfırlasın; aksi halde bir sonraki
  // kullanıcının izleme listesi öncekinin hesabına yazılabilir.
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
}

/** Token geçersizse (401) oturumu düşürmek için API katmanından çağrılır. */
export function notifyUnauthorized(): void {
  clearStoredSession();
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearSession = () => {
    clearStoredSession();
    setAccessToken(null);
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

  // Sayfa açıldığında oturumu kontrol et (localStorage + silent refresh)
  useEffect(() => {
    const initAuth = async () => {
      // 1. Önce localStorage'daki hazır oturum bilgisini yükle (Anında hızlı giriş için)
      const storedToken = localStorage.getItem('replay_access_token');
      const storedUserStr = localStorage.getItem('replay_user');

      if (storedToken && storedUserStr) {
        try {
          setAccessToken(storedToken);
          setUser(JSON.parse(storedUserStr));
          setIsLoading(false);
          return;
        } catch (e) {
          console.warn("Stored user parse error:", e);
        }
      }

      // 2. Arka planda silent refresh dene
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.access_token);
          localStorage.setItem('replay_access_token', data.access_token);

          const userRes = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${data.access_token}`
            }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            setUser(userData);
            localStorage.setItem('replay_user', JSON.stringify(userData));
          }
        }
      } catch (err) {
        console.error("Auth init silent refresh failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const loginDemoUser = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'dev_mock_google_token' })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('replay_access_token', data.access_token);
        localStorage.setItem('replay_user', JSON.stringify(data.user));
        setAccessToken(data.access_token);
        setUser(data.user);
        setIsLoading(false);
        return;
      }
    } catch (e) {
      console.warn("Demo login failed:", e);
    }

    // Backend'e ulaşılamadıysa sahte bir oturum kurulmaz: stratejiler artık
    // kullanıcıya bağlı olduğu için gerçek bir JWT olmadan hiçbir çağrı
    // çalışmaz; sahte token kullanıcıyı anında giriş ekranına geri düşürürdü.
    setIsLoading(false);
    throw new Error('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
  };

  const loginWithGoogle = async (credential: string) => {
    if (credential === 'dev_mock_google_token') {
      loginDemoUser();
      return;
    }

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
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Google girişi başarısız');
      }

      const data = await res.json();
      localStorage.setItem('replay_access_token', data.access_token);
      localStorage.setItem('replay_user', JSON.stringify(data.user));
      setAccessToken(data.access_token);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      clearSession();
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
        loginDemoUser,
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
