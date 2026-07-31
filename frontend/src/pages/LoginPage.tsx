import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { BarChart2, Zap, ShieldCheck, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.jpg';

/**
 * Landing page ile aynı tasarım dili: siyah zemin (#0a0b0e), tek emerald
 * vurgu, ince beyaz kenarlıklar. Sağdaki illüstrasyon, landing hero'sundaki
 * ReplayPreview ile birebir aynı olmasın diye ayrı, elle çizilmiş bir grafik
 * animasyonu — eski tasarımın görsel formatı (cam efekti, gölge, döndürülmüş
 * rozetler) korunuyor, indigo/amber tonları emerald'a çevrildi.
 *
 * Rozetlerdeki "+68.4% Win Rate" ve "10.000+ Bar/Saniye" metinleri
 * ölçülmüş/doğrulanmış rakamlar değildir — kullanıcı, bunları kaldırmayı
 * önerdiğim uyarıdan sonra bilerek ve açıkça eski hâliyle geri istedi
 * (bkz. sohbet geçmişi). Bilinçli bir ürün kararı olarak burada duruyor.
 *
 * Ekran metni bilinçli olarak İngilizcedir (kullanıcı onayıyla) — landing
 * page İngilizce, giriş akışı ondan sonra geldiği için dil tutarlılığı
 * korunuyor. CLAUDE.md'nin "UI metni Türkçedir" kuralına bilerek istisna.
 */

const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`mx-auto w-full max-w-[1080px] px-6 ${className}`}>{children}</div>
);

const UP = '#3ecf8e';
const DOWN = '#ef5f6b';
/** Trend çizgisi ve altındaki dolgu için mavi-yeşil (teal) arası vurgu rengi. */
const TREND = '#22b8a3';

/**
 * `onBack` şimdilik kullanılmıyor — bu ekranın landing page ile bağlantısı
 * bilinçli olarak kesildi, App.tsx tarafı ayrıca ele alınacak. Prop yine de
 * tipte duruyor ki çağıran taraf değişmeden derlensin.
 */
export const LoginPage: React.FC<{ onBack?: () => void }> = () => {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const [animKey, setAnimKey] = React.useState(0);

  const handleSuccess = async (credentialResponse: any) => {
    if (credentialResponse.credential) {
      try {
        setError(null);
        await loginWithGoogle(credentialResponse.credential);
      } catch (err: any) {
        setError(err.message || 'Something went wrong while signing in.');
      }
    }
  };

  const handleError = () => {
    setError('Google sign-in failed. Please try again.');
  };

  return (
    <div className="flex min-h-screen items-center bg-[#0a0b0e] [background-image:radial-gradient(120%_100%_at_100%_0%,rgba(16,185,129,0.22),transparent_65%)] text-zinc-100 antialiased">
      {/* Bilinçli olarak app bar ve alt bilgi yok: bu tek ekranlık bir
          adım, sayfa tam viewport yüksekliğinde ortalanıyor — içerik
          kısaysa altında boşluk kalmaması için dikey ortalama flex ile
          yapılıyor (min-h-screen + top-align yerine).

          Radial-gradient bilinçli olarak bu en dıştaki, tam viewport
          yüksekliğindeki div'de — section içindeydi ama section içeriğin
          doğal yüksekliği kadar (viewport'tan kısa), bu yüzden section'ın
          üstünde/altında dikey ortalamadan doğan boşluk düz siyah kalıp
          section sınırında sert bir çizgi oluşturuyordu. Burada gradient
          tüm ekranı kapladığı için o sınır artık yok. */}
      <section className="relative w-full">
        <Container className="relative grid grid-cols-1 items-center gap-14 py-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <img
              src={logoImg}
              alt="REPLAY"
              className="h-9 w-9 rounded-md object-cover opacity-90"
            />
            <h1 className="mt-5 text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-zinc-100 sm:text-[36px]">
              Sign in to REPLAY.
            </h1>
            <p className="mt-4 max-w-[380px] text-[14px] leading-[1.75] text-zinc-400">
              Test strategies, replay the market and review your data.
            </p>

            {error && (
              <p className="mt-5 max-w-[380px] rounded-md border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[13px] text-red-400/90">
                {error}
              </p>
            )}

            <div className="mt-8">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={handleError}
                theme="filled_black"
                shape="pill"
                size="large"
                text="signin_with"
                locale="en"
              />
            </div>

            {/* Yalnızca yerel geliştirme derlemesinde görünür (import.meta.env.DEV).
                Google akışını atlayıp backend'in DEV_LOGIN_TOKEN bypass'ını kullanır
                (bkz. backend/.env, .env.example ve auth/dependencies.py). Üretim
                build'inde bu buton hiç render edilmez. */}
            {import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN_TOKEN && (
              <button
                onClick={() => handleSuccess({ credential: import.meta.env.VITE_DEV_LOGIN_TOKEN })}
                className="mt-3 w-full max-w-[280px] rounded-full border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-4 py-2 text-[12px] font-medium text-amber-400/90 hover:bg-amber-500/10"
              >
                Dev test girişi
              </button>
            )}

            {/* Küçük özellik rozetleri — Google butonunun hemen altında,
                landing page'in tek cümlelik açıklamalarına göre daha "cool"
                bir görünüm istendiği için düz metin yerine ikon+etiket
                kartlarına dönüldü. */}
            <div className="mt-8 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-6">
              <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-center">
                <BarChart2 size={13} className="shrink-0 text-emerald-400" />
                <span className="text-[10.5px] text-zinc-400">Replay</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-center">
                <Zap size={13} className="shrink-0 text-emerald-400" />
                <span className="text-[10.5px] text-zinc-400">Strategies</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-center">
                <ShieldCheck size={13} className="shrink-0 text-emerald-400" />
                <span className="text-[10.5px] text-zinc-400">Secure</span>
              </div>
            </div>
          </div>

          {/* Sağ taraf: elle çizilmiş trend çizgisi + mum illüstrasyonu.
              Bilinçli olarak kutu/kart görünümünde değil — kenarlık ve arka
              plan yok, sayfanın kendi zeminine oturuyor. Grafik gövdesi bir
              radial mask ile kenarlarda sayfaya doğru soluyor (daha doğal
              bir geçiş için); rozetler bu maskenin dışında, tam opak kalıyor. */}
          <div className="lg:pl-2">
            <div
              onClick={() => setAnimKey((k) => k + 1)}
              className="relative w-full cursor-pointer"
              title="Click to replay the drawing animation"
            >
              <style>{`
                @keyframes loginDrawLine {
                  0% { stroke-dashoffset: 600; }
                  100% { stroke-dashoffset: 0; }
                }
                @keyframes loginFadeInFill {
                  0% { opacity: 0; }
                  100% { opacity: 1; }
                }
              `}</style>

              <div className="absolute -top-3 left-2 z-20 flex items-center gap-2.5 rounded-2xl border border-emerald-500/25 bg-[#0c0d11]/90 px-3 py-2 shadow-xl backdrop-blur-md transform -rotate-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-400">Backtest Performance</div>
                  <div className="text-xs font-bold text-emerald-400">+68.4% Win Rate</div>
                </div>
              </div>

              <div className="absolute -bottom-2 right-2 z-20 flex items-center gap-2.5 rounded-2xl border border-emerald-500/25 bg-[#0c0d11]/90 px-3 py-2 shadow-xl backdrop-blur-md transform rotate-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-400">Data Processed</div>
                  <div className="text-xs font-bold text-emerald-300">10,000+ Bars / Second</div>
                </div>
              </div>

              <div className="[mask-image:radial-gradient(ellipse_82%_82%_at_50%_48%,black_55%,transparent_100%)]">
                <svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-auto w-full">
                  <defs>
                    <linearGradient id="loginChartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TREND} stopOpacity="0.32" />
                      <stop offset="100%" stopColor={TREND} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="loginChartLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3454d1" />
                      <stop offset="60%" stopColor={TREND} />
                      <stop offset="100%" stopColor={UP} />
                    </linearGradient>
                  </defs>

                  <path
                    key={`fill-${animKey}`}
                    d="M30 180 Q80 140 120 160 T210 110 T290 80 T370 45 L370 200 L30 200 Z"
                    fill="url(#loginChartFill)"
                    style={{ animation: 'loginFadeInFill 2.2s ease-in-out forwards' }}
                  />
                  <path
                    key={`line-${animKey}`}
                    d="M30 180 Q80 140 120 160 T210 110 T290 80 T370 45"
                    stroke="url(#loginChartLine)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray="600"
                    strokeDashoffset="600"
                    style={{ animation: 'loginDrawLine 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
                  />

                  {[
                    [60, 130, 175, 54, 140, 24, UP],
                    [95, 125, 165, 89, 132, 22, DOWN],
                    [130, 115, 160, 124, 122, 28, UP],
                    [165, 100, 145, 159, 108, 20, DOWN],
                    [200, 80, 130, 194, 88, 32, UP],
                    [235, 65, 110, 229, 72, 26, UP],
                    [270, 60, 100, 264, 68, 18, DOWN],
                    [305, 40, 85, 299, 45, 32, UP],
                    [340, 25, 65, 334, 30, 28, UP],
                  ].map(([lx, ly1, ly2, rx, ry, rh, color], i) => (
                    <g key={i}>
                      <line x1={lx} y1={ly1} x2={lx} y2={ly2} stroke={color as string} strokeWidth="1.5" />
                      <rect x={rx} y={ry} width="12" height={rh} rx="2" fill={color as string} />
                    </g>
                  ))}

                  <circle cx="370" cy="45" r="5" fill={UP} />
                </svg>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
};
