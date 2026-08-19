import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface PublicOnlyRouteProps {
  children: React.ReactNode;
}

/**
 * Landing/login gibi herkese açık sayfaları sarar. Kullanıcının geçerli bir
 * oturumu (access token JWT süresi boyunca) varsa bu sayfaları göstermek
 * yerine doğrudan /app'e yönlendirir — her açılışta landing page'e düşüp
 * tekrar giriş akışına girmesini önler.
 */
export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-content">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-content-muted">Oturum doğrulanıyor...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};

export default PublicOnlyRoute;
