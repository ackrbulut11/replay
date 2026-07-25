import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  initial_balance: number;
  currency: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  loginDemoUser: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://replay-xj3e.onrender.com/api' : '/api');

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
      console.warn("Demo backend sync fallback:", e);
    }

    const mockUser: User = {
      id: '2494589c-21fb-4b8e-b00a-53f93efbce73',
      email: 'demo.trader@example.com',
      name: 'Demo Trader',
      avatar_url: 'https://lh3.googleusercontent.com/a/default-user',
      initial_balance: 10000.0,
      currency: 'USD'
    };
    const mockToken = 'dev_mock_access_token_demo';

    localStorage.setItem('replay_access_token', mockToken);
    localStorage.setItem('replay_user', JSON.stringify(mockUser));
    setAccessToken(mockToken);
    setUser(mockUser);
    setIsLoading(false);
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
      localStorage.setItem('replay_auth_token', data.access_token);
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
      localStorage.removeItem('replay_access_token');
      localStorage.removeItem('replay_user');
      setAccessToken(null);
      setUser(null);
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
