import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, ShieldCheck, BarChart2, Zap } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  const handleSuccess = async (credentialResponse: any) => {
    if (credentialResponse.credential) {
      try {
        setError(null);
        await loginWithGoogle(credentialResponse.credential);
      } catch (err: any) {
        setError(err.message || 'Giriş yapılırken bir hata oluştu');
      }
    }
  };

  const handleError = () => {
    setError('Google ile giriş başarısız oldu. Lütfen tekrar deneyin.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/20 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-blue-600/15 blur-3xl rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center mb-4 text-indigo-400">
            <TrendingUp size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Trading Platform</h1>
          <p className="text-sm text-slate-400 mt-1">Market Replay & Backtest Araştırma Platformu</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-2">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            theme="filled_black"
            shape="pill"
            size="large"
            text="signin_with"
            locale="tr"
          />
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
          <div className="flex flex-col items-center gap-1">
            <BarChart2 size={16} className="text-indigo-400" />
            <span>Market Replay</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Zap size={16} className="text-amber-400" />
            <span>Hızlı Backtest</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span>Güvenli Bulut</span>
          </div>
        </div>
      </div>
    </div>
  );
};
