import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, BarChart2, Zap, TrendingUp, Activity, CheckCircle2 } from 'lucide-react';
import logoImg from '../assets/logo.jpg';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle, loginDemoUser } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const [animKey, setAnimKey] = React.useState(0);

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
    <div className="min-h-screen bg-[#060911] text-slate-100 flex items-center justify-center p-4 lg:p-8 relative overflow-hidden select-none">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-emerald-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Split Screen Container */}
      <div className="w-full max-w-5xl bg-[#0b101d]/90 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 z-10 my-auto">
        
        {/* Left Side: Form Section (6 Columns) */}
        <div className="lg:col-span-6 p-8 lg:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800/60 bg-slate-900/40">
          <div>
            {/* Header Brand */}
            <div className="flex items-center gap-3 mb-10">
              <div className="w-11 h-11 rounded-xl overflow-hidden border border-indigo-500/40 shadow-lg shadow-indigo-500/20 bg-slate-900 flex items-center justify-center pointer-events-none">
                <img src={logoImg} alt="REPLAY Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-wider text-white">REPLAY</span>
                <span className="block text-[10px] tracking-widest text-indigo-400 font-semibold uppercase">Trading Platform</span>
              </div>
            </div>

            {/* Title & Subtitle */}
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Giriş Yap</h1>
              <p className="text-xs lg:text-sm text-slate-400 leading-relaxed">
                Stratejilerinizi test etmek, piyasayı simüle etmek ve trading verilerinizi incelemek için oturum açın.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs text-center">
                {error}
              </div>
            )}

            {/* Auth Buttons */}
            <div className="space-y-4">
              <div className="flex justify-center">
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

              <div className="flex items-center gap-3 my-2">
                <div className="h-[1px] bg-slate-800 flex-1" />
                <span className="text-[11px] text-slate-500 font-medium uppercase">veya</span>
                <div className="h-[1px] bg-slate-800 flex-1" />
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    setError(null);
                    loginDemoUser();
                  } catch (err: any) {
                    setError('Demo girişi sırasında bir hata oluştu.');
                  }
                }}
                className="w-full py-3 px-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99] rounded-full text-xs font-semibold text-white transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-600/25 cursor-pointer"
              >
                <span>🚀 Demo / Test Hesabı İle Giriş Yap</span>
              </button>
            </div>
          </div>

          {/* Bottom Security / Feature Badges */}
          <div className="mt-10 pt-6 border-t border-slate-800/60 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
            <div className="flex items-center justify-center gap-1.5 bg-slate-800/40 p-2 rounded-xl border border-slate-800/60">
              <BarChart2 size={14} className="text-indigo-400" />
              <span>Replay Modu</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 bg-slate-800/40 p-2 rounded-xl border border-slate-800/60">
              <Zap size={14} className="text-amber-400" />
              <span>Backtest</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 bg-slate-800/40 p-2 rounded-xl border border-slate-800/60">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Güvenli</span>
            </div>
          </div>
        </div>

        {/* Right Side: Quote & Trading Illustration Section (6 Columns) */}
        <div className="lg:col-span-6 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-emerald-950/30 p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
          
          {/* Subtle Grid Pattern Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          {/* Testimonial / Quote Box */}
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-indigo-300 text-xs font-medium">
              <Activity size={13} className="text-indigo-400" />
              <span>Gelişmiş Strateji Simülatörü</span>
            </div>
            <h2 className="text-xl lg:text-2xl font-bold text-white leading-snug">
              Piyasaları Geçmiş Verilerle Oynatın, Risk Almadan Ustalaşın.
            </h2>
            <p className="text-xs lg:text-sm text-slate-300/80 leading-relaxed">
              Geçmiş fiyat hareketlerini bar-bar yeniden oynatarak alım-satım stratejilerinizi canlı hissiyle test edin.
            </p>
          </div>

          {/* Financial / Chart Vector Illustration */}
          <div className="relative z-10 my-6 py-4 flex items-center justify-center">
            <div 
              onClick={() => setAnimKey(prev => prev + 1)}
              className="w-full max-w-md relative cursor-pointer group"
              title="Çizim animasyonunu tekrar oynatmak için tıklayın"
            >
              <style>{`
                @keyframes drawTrendLine {
                  0% { stroke-dashoffset: 600; }
                  100% { stroke-dashoffset: 0; }
                }
                @keyframes fadeInFill {
                  0% { opacity: 0; }
                  100% { opacity: 1; }
                }
              `}</style>
              
              {/* Glassmorphism Floating Stat Badge (Top Left) */}
              <div className="absolute -top-3 left-2 z-20 bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 px-3 py-2 rounded-2xl shadow-xl flex items-center gap-2.5 transform -rotate-2 group-hover:border-emerald-500/60 transition-colors">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Backtest Başarısı</div>
                  <div className="text-xs font-bold text-emerald-400">+68.4% Win Rate</div>
                </div>
              </div>

              {/* Glassmorphism Floating Stat Badge (Bottom Right) */}
              <div className="absolute -bottom-2 right-2 z-20 bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 px-3 py-2 rounded-2xl shadow-xl flex items-center gap-2.5 transform rotate-2 group-hover:border-indigo-500/60 transition-colors">
                <div className="w-7 h-7 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">İşlenen Veri</div>
                  <div className="text-xs font-bold text-indigo-300">10,000+ Bar / Saniye</div>
                </div>
              </div>

              {/* Custom High-Tech SVG Trading Chart Illustration */}
              <svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
                {/* Background Grid Lines */}
                <path d="M20 40H380M20 90H380M20 140H380M20 190H380" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />

                {/* Glowing Trend Line & Area Fill */}
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="50%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>

                <path
                  key={`fill-${animKey}`}
                  d="M30 180 Q80 140 120 160 T210 110 T290 80 T370 45 L370 200 L30 200 Z"
                  fill="url(#chartGradient)"
                  style={{ animation: 'fadeInFill 2.2s ease-in-out forwards' }}
                />
                <path
                  key={`line-${animKey}`}
                  d="M30 180 Q80 140 120 160 T210 110 T290 80 T370 45"
                  stroke="url(#lineGradient)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray="600"
                  strokeDashoffset="600"
                  style={{ animation: 'drawTrendLine 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
                />

                {/* Candlestick Vectors */}
                {/* Candle 1 (Green) */}
                <line x1="60" y1="130" x2="60" y2="175" stroke="#10b981" strokeWidth="1.5" />
                <rect x="54" y="140" width="12" height="24" rx="2" fill="#10b981" />

                {/* Candle 2 (Red) */}
                <line x1="95" y1="125" x2="95" y2="165" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="89" y="132" width="12" height="22" rx="2" fill="#ef4444" />

                {/* Candle 3 (Green) */}
                <line x1="130" y1="115" x2="130" y2="160" stroke="#10b981" strokeWidth="1.5" />
                <rect x="124" y="122" width="12" height="28" rx="2" fill="#10b981" />

                {/* Candle 4 (Red) */}
                <line x1="165" y1="100" x2="165" y2="145" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="159" y="108" width="12" height="20" rx="2" fill="#ef4444" />

                {/* Candle 5 (Green) */}
                <line x1="200" y1="80" x2="200" y2="130" stroke="#10b981" strokeWidth="1.5" />
                <rect x="194" y="88" width="12" height="32" rx="2" fill="#10b981" />

                {/* Candle 6 (Green) */}
                <line x1="235" y1="65" x2="235" y2="110" stroke="#10b981" strokeWidth="1.5" />
                <rect x="229" y="72" width="12" height="26" rx="2" fill="#10b981" />

                {/* Candle 7 (Red) */}
                <line x1="270" y1="60" x2="270" y2="100" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="264" y="68" width="12" height="18" rx="2" fill="#ef4444" />

                {/* Candle 8 (Green Big) */}
                <line x1="305" y1="40" x2="305" y2="85" stroke="#10b981" strokeWidth="1.5" />
                <rect x="299" y="45" width="12" height="32" rx="2" fill="#10b981" />

                {/* Candle 9 (Green Peak) */}
                <line x1="340" y1="25" x2="340" y2="65" stroke="#10b981" strokeWidth="1.5" />
                <rect x="334" y="30" width="12" height="28" rx="2" fill="#10b981" />

                {/* Static Target Node (No pulse/ping animation) */}
                <circle cx="370" cy="45" r="5" fill="#34d399" />
              </svg>
            </div>
          </div>

          {/* Bottom Feature List */}
          <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-4">
            <span>🚀 100+ İndikatör & Çizim Aracı</span>
            <span>⚡ Yıldırım Hızında Backtest</span>
          </div>

        </div>

      </div>
    </div>
  );
};
