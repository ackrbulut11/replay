import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { ReplayPreview } from '../components/ReplayPreview';
import { joinWaitlist, WaitlistSource } from '../services/waitlistApi';
import { useAuth } from '../context/AuthContext';

/**
 * Herkese açık tanıtım sayfası.
 *
 * Ürün henüz yarım (backtest raporları, günlük, optimizasyon yol haritasında)
 * olduğu için sayfanın işi satış yapmak değil, erken erişim listesi toplamak.
 * Bu yüzden hiçbir yerde uydurma metrik yoktur: yazan her sayı ve her özellik
 * kodda gerçekten var olan şeydir, "Roadmap" bölümü de olmayanları açıkça
 * söyler. Ziyaretçiyi doğrudan giriş ekranına atmak, ürünün en zayıf anını ilk
 * izlenim yapardı.
 *
 * Sayfa metni bilinçli olarak İngilizcedir: hedef kitle uluslararası trading
 * topluluğu. Giriş ekranı (LoginPage) de aynı gerekçeyle İngilizceye
 * çevrildi — dil, uygulamanın geri kalanında (Türkçe) değil, bu iki herkese
 * açık ekranda tutarlı. CLAUDE.md'nin "UI metni Türkçedir" kuralına burada
 * bilerek istisna yapılıyor.
 */

// ─── Erken erişim formu ──────────────────────────────────────────────────────

/**
 * Backend'deki EMAIL_PATTERN (waitlist.py) ile aynı ruhta, basitleştirilmiş
 * bir istemci tarafı kontrolü. Amaç sunucuya gitmeden bariz hatalı adresleri
 * yakalamak — nihai doğrulama yine backend'de.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `note` formun altındaki küçük açıklama. Bilinçli olarak forma ait: kayıt
 * tamamlandığında birlikte kaybolur, aksi halde teşekkür mesajının hemen
 * altında aynı şeyi tekrar eden bir satır kalıyor.
 */
const WaitlistForm: React.FC<{ source: WaitlistSource; note?: string; onSubmitted?: () => void }> = ({
  source,
  note,
  onSubmitted,
}) => {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');
  const [alreadyRegistered, setAlreadyRegistered] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;

    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('sending');
    try {
      const result = await joinWaitlist(trimmed, source);
      setStatus('done');
      setMessage(result.message);
      setAlreadyRegistered(result.already_registered);
      onSubmitted?.();
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to submit. Please try again.');
    }
  };

  if (status === 'done') {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-md border px-4 py-3 text-sm ${
          alreadyRegistered
            ? 'border-line-strong bg-white/[0.03] text-content-muted'
            : 'border-accent-500/20 bg-accent-500/[0.06] text-accent-400'
        }`}
      >
        <Check size={16} className={`shrink-0 ${alreadyRegistered ? 'text-content-faint' : 'text-accent-400'}`} />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div>
      {/* noValidate: tarayıcının kendi "@ ekleyin" balonu hem Türkçe hem de
          her tuş vuruşunda tetikleniyordu. Doğrulama artık tamamen
          handleSubmit'teki EMAIL_PATTERN kontrolünde — tek, İngilizce ve
          yalnızca gönderildiğinde görünen bir mesaj. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-11 w-full rounded-md border border-line bg-white/[0.03] px-3.5 text-sm text-content-strong outline-none transition placeholder:text-content-faint focus:border-accent-500 focus:bg-white/[0.05] sm:max-w-[290px]"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-ink-50 px-5 text-sm font-medium text-ink-950 transition-colors ease-out hover:bg-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending' : 'Join the list'}
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </form>
      {status === 'error' && (
        <p className="mt-2.5 text-xs text-loss-400/90">{message}</p>
      )}
      {note && <p className="mt-3 text-xs leading-relaxed text-content-faint">{note}</p>}
    </div>
  );
};

// ─── Bölüm yardımcıları ──────────────────────────────────────────────────────

const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`mx-auto w-full max-w-[1080px] px-6 ${className}`}>{children}</div>
);

const STEPS = [
  {
    no: '01',
    title: 'Build the rule',
    body: 'Indicators, operators, levels. No code involved.',
  },
  {
    no: '02',
    title: 'Test single symbol',
    body: 'Evaluate historical win rate, drawdown and return.',
  },
  {
    no: '03',
    title: 'Scan the market',
    body: 'Run the exact same rule across your entire watchlist.',
  },
  {
    no: '04',
    title: 'Replay the setup',
    body: 'Step through it bar by bar, without seeing what comes next.',
  },
];

const SHIPPED = [
  'Strategy builder on JSON rule trees',
  'Backtest a rule over historical bars',
  'Batch scan — one rule, your whole list',
  'Replay controls — step one bar at a time',
  'Candlestick chart with drawing tools',
  'Price and indicator alerts, watchlists',
];

const PLANNED = [
  'Backtest reports — equity curve, drawdown',
  'Trade journal and statistics',
  'Parameter optimization',
  'Live data over WebSocket',
  'Saved workspaces',
];

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export const LandingPage: React.FC<{ onLogin?: () => void }> = ({ onLogin }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  // Erken erişim formu gönderildiğinde (yeni kayıt ya da zaten kayıtlı fark
  // etmez) üstteki "Sign in" yerine "Go to App" gösterilir — kullanıcı listeye
  // katıldıktan hemen sonra uygulamayı denemeye yönlendirilir.
  const [emailSubmitted, setEmailSubmitted] = React.useState(false);

  const handleSignInClick = () => {
    if (onLogin) {
      onLogin();
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-content-strong antialiased">
      {/* Üst çubuk bilerek sticky değil: aşağı kaydırınca sayfayla birlikte
          kaybolur, boş yere ekranda yer kaplamaz. */}
      <header className="border-b border-line">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img
              src={logoImg}
              alt=""
              className="h-7 w-7 rounded-md object-cover opacity-90"
            />
            {/* Gradient metin kaldırıldı: mavi-yeşil-mor geçiş sayfanın geri
                kalanıyla hiçbir renk paylaşmıyordu ve küçük puntoda okunması
                zorlaşıyordu. Vurgu artık ağırlık ve harf aralığından geliyor. */}
            <span className="text-sm font-medium tracking-[0.16em] text-content-strong">
              REPLAY
            </span>
          </Link>

          {!isAuthenticated && (
            <div>
              {emailSubmitted ? (
                <button
                  onClick={handleSignInClick}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500/20 border border-accent-500/40 px-4 py-1.5 text-xs font-medium text-accent-400 transition-colors hover:bg-accent-300/30"
                >
                  Go to App
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleSignInClick}
                  className="text-xs font-medium text-content-muted transition-colors hover:text-content-strong"
                >
                  Sign in
                </button>
              )}
            </div>
          )}
        </Container>
      </header>

      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Grafiğin arkasında tek bir ışık; sayfanın geri kalanı düz. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-10%] top-[-10%] h-[520px] w-[620px] rounded-full bg-accent-500/[0.14] blur-[120px]"
        />
        <Container className="relative grid grid-cols-1 items-center gap-14 pb-20 pt-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-12 lg:pb-28 lg:pt-24">
          <div>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[44px] lg:text-[50px]">
              One rule.
              <br />
              Every symbol.
              <br />
              {/* Satır sonu bilinçli: cümle zaten bu genişlikte iki satıra
                  düşüyor, kırılma yerini şansa bırakmamak için sabitlendi. */}
              <span className="text-content-faint">
                Tested on history,
                <br />
                not on your money.
              </span>
            </h1>
            <p className="mt-6 max-w-[440px] text-base leading-[1.75] text-content-muted">
              {/* Piyasa adları bilinçli olarak sayfanın hiçbir yerinde yok:
                  sabit bir liste kapanmış bir set gibi okunuyor, halbuki yeni
                  piyasalar eklenecek. */}
              Build a rule, backtest it on historical data, then run it across every
              symbol in your watchlist in a single scan.
            </p>

            <div className="mt-9">
              <WaitlistForm
                source="hero"
                note="One invite email when it is ready. Nothing else, ever."
                onSubmitted={() => setEmailSubmitted(true)}
              />
            </div>
          </div>

          <div className="lg:pl-2">
            <ReplayPreview />
          </div>
        </Container>
      </section>

      {/* ─── Gerçek sayılar şeridi ─────────────────────────────────────── */}
      <section className="border-y border-line">
        <Container className="grid grid-cols-2 divide-white/[0.06] sm:grid-cols-4 sm:divide-x">
          {[
            ['Every symbol', 'One rule across your whole watchlist'],
            ['8 timeframes', '1 minute up to 1 month'],
            ['No code', 'Strategies are JSON rule trees'],
            ['No lookahead', 'Signals come from closed bars only'],
          ].map(([title, sub], i) => (
            <div
              key={title}
              className={`px-0 py-7 sm:px-6 ${i === 0 ? 'sm:pl-0' : ''} ${
                i === 3 ? 'sm:pr-0' : ''
              }`}
            >
              <div className="text-[15px] font-medium tracking-tight text-content-strong">
                {title}
              </div>
              <div className="mt-1.5 text-xs leading-relaxed text-content-faint">
                {sub}
              </div>
            </div>
          ))}
        </Container>
      </section>

      {/* ─── Nasıl çalışır ─────────────────────────────────────────────── */}
      <section className="border-b border-line py-20 lg:py-28">
        <Container>
          <h2 className="mt-5 max-w-[560px] text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
            Write the rule once. Run it on everything you follow.
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-10 divide-white/[0.06] sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:grid-cols-4 lg:gap-0 lg:divide-x">
            {STEPS.map((step, i) => (
              <div
                key={step.no}
                className={`lg:px-8 ${i === 0 ? 'lg:pl-0' : ''} ${
                  i === STEPS.length - 1 ? 'lg:pr-0' : ''
                }`}
              >
                <span className="font-mono text-2xs tracking-[0.1em] text-content-faint">
                  {step.no}
                </span>
                <h3 className="mt-4 text-[15px] font-medium tracking-tight text-content-strong">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-[1.7] text-content-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── Strateji testi + toplu tarama ─────────────────────────────── */}
      <section className="border-b border-line py-20 lg:py-28">
        <Container className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="mt-5 text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
              Backtest one symbol. Scan them all.
            </h2>
            <p className="mt-6 max-w-[440px] text-base leading-[1.75] text-content-muted">
              Backtest on one symbol, then send the same rule across your whole
              watchlist in one batch. Each symbol returns its own trades, win rate,
              PnL and latest signal.
            </p>
          </div>

          {/* Gerçek batch-evaluate yanıt şekli; alan adları
              BatchEvaluateResultItem (backend/app/rules/strategy_models.py)
              ile birebir aynı. Sayılar temsilîdir, gerçek çalışma değildir. */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-2xs tracking-[0.18em] text-content-faint">
                BATCH SCAN
              </span>
              <span className="text-2xs text-content-faint">4 symbols · 1h</span>
            </div>
            <table className="w-full border-collapse text-2xs">
              <thead>
                <tr className="border-b border-line text-left text-content-faint">
                  <th className="px-4 py-2 font-normal">Symbol</th>
                  <th className="px-3 py-2 text-right font-normal">Trades</th>
                  <th className="px-3 py-2 text-right font-normal">Win rate</th>
                  <th className="px-3 py-2 text-right font-normal">PnL</th>
                  <th className="px-4 py-2 text-right font-normal">Last signal</th>
                </tr>
              </thead>
              <tbody className="font-mono text-content">
                {[
                  ['BTCUSDT', 14, 64.3, 18.9, 'BUY'],
                  ['ETHUSDT', 11, 45.5, -3.2, 'FLAT'],
                  ['SOLUSDT', 19, 57.9, 26.4, 'BUY'],
                  ['XRPUSDT', 9, 33.3, -8.1, 'FLAT'],
                ].map(([symbol, trades, winRate, pnl, signal]) => (
                  <tr key={symbol as string} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-content-strong">{symbol}</td>
                    <td className="px-3 py-2.5 text-right">{trades}</td>
                    <td className="px-3 py-2.5 text-right">{(winRate as number).toFixed(1)}%</td>
                    <td
                      className="px-3 py-2.5 text-right"
                      style={{ color: (pnl as number) >= 0 ? '#3ecf8e' : '#ef5f6b' }}
                    >
                      {(pnl as number) >= 0 ? '+' : ''}
                      {pnl}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-content-faint">{signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-4 py-2.5 text-2xs leading-relaxed text-content-faint">
              Example output shape &mdash; your numbers depend on the rule and the
              range you run it over.
            </div>
          </div>
        </Container>
      </section>

      {/* ─── Lookahead bias ────────────────────────────────────────────── */}
      <section className="border-b border-line py-20 lg:py-28">
        <Container className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="mt-5 text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
              A backtest that cannot see the future.
            </h2>
            <p className="mt-6 max-w-[440px] text-base leading-[1.75] text-content-muted">
              Forward-looking access is banned by design: indicators stay blank
              until warm-up, signals only ever come from a closed bar. Backtest,
              scan and replay share one engine.
            </p>
          </div>

          {/* Gerçek kural ağacı; alan adları motorun okuduklarıyla birebir aynı. */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-2xs uppercase tracking-[0.18em] text-content-faint">
                entry_rules
              </span>
              <span className="text-2xs text-content-faint">RSI reversal + trend filter</span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-2xs leading-[1.85] text-content-faint">
              <code>
                {'{\n'}
                {'  '}<span className="text-content">"logic"</span>{': '}<span className="text-accent-300/80">"AND"</span>{',\n'}
                {'  '}<span className="text-content">"conditions"</span>{': [\n'}
                {'    {\n'}
                {'      '}<span className="text-content">"left"</span>{':     { '}<span className="text-content-muted">"type"</span>{': '}<span className="text-accent-300/80">"indicator"</span>{', '}<span className="text-content-muted">"name"</span>{': '}<span className="text-accent-300/80">"RSI"</span>{',\n'}
                {'                   '}<span className="text-content-muted">"period"</span>{': '}<span className="text-warn-200/70">"$rsi_period"</span>{' },\n'}
                {'      '}<span className="text-content">"operator"</span>{': '}<span className="text-accent-300/80">"cross_above"</span>{',\n'}
                {'      '}<span className="text-content">"right"</span>{':    { '}<span className="text-content-muted">"type"</span>{': '}<span className="text-accent-300/80">"value"</span>{', '}<span className="text-content-muted">"value"</span>{': '}<span className="text-sky-300/80">30</span>{' }\n'}
                {'    },\n'}
                {'    {\n'}
                {'      '}<span className="text-content">"left"</span>{':     { '}<span className="text-content-muted">"type"</span>{': '}<span className="text-accent-300/80">"price"</span>{', '}<span className="text-content-muted">"field"</span>{': '}<span className="text-accent-300/80">"close"</span>{' },\n'}
                {'      '}<span className="text-content">"operator"</span>{': '}<span className="text-accent-300/80">"&gt;"</span>{',\n'}
                {'      '}<span className="text-content">"right"</span>{':    { '}<span className="text-content-muted">"type"</span>{': '}<span className="text-accent-300/80">"indicator"</span>{', '}<span className="text-content-muted">"name"</span>{': '}<span className="text-accent-300/80">"EMA"</span>{',\n'}
                {'                   '}<span className="text-content-muted">"period"</span>{': '}<span className="text-sky-300/80">200</span>{' }\n'}
                {'    }\n'}
                {'  ]\n'}
                {'}'}
              </code>
            </pre>
            <div className="border-t border-line px-4 py-2.5 text-2xs leading-relaxed text-content-faint">
              <span className="text-warn-200/60">$rsi_period</span> is a strategy
              parameter &mdash; the value changes in the UI, the rule stays the same.
            </div>
          </div>
        </Container>
      </section>

      {/* ─── Durum ─────────────────────────────────────────────────────── */}
      <section className="border-b border-line py-20 lg:py-28">
        <Container>
          <h2 className="mt-5 max-w-[560px] text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
            Half of it is built. Here is exactly which half.
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
            <div>
              <div className="flex items-center gap-2.5 border-b border-line pb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                <span className="text-xs font-medium tracking-wide text-content">
                  Working today
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {SHIPPED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-content">
                    <Check size={14} className="mt-[3px] shrink-0 text-accent-400/80" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2.5 border-b border-line pb-3">
                <span className="h-1.5 w-1.5 rounded-full border border-line-strong" />
                <span className="text-xs font-medium tracking-wide text-content-faint">
                  Roadmap
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {PLANNED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-content-faint">
                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full border border-line-strong" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── Kapanış ───────────────────────────────────────────────────── */}
      <section className="py-20 lg:py-28">
        <Container className="max-w-[620px] text-center">
          <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
            Early access list
          </h2>
          <p className="mx-auto mt-4 max-w-[420px] text-base leading-[1.75] text-content-muted">
            The engine, replay and batch scans are already available. We&rsquo;ll
            email you when the rest is ready.
          </p>
          <div className="mt-8 flex justify-center">
            <WaitlistForm source="footer" onSubmitted={() => setEmailSubmitted(true)} />
          </div>
        </Container>
      </section>

      {/* ─── Alt bilgi ─────────────────────────────────────────────────── */}
      <footer className="border-t border-line py-8">
        <Container className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <img
              src={logoImg}
              alt=""
              className="h-5 w-5 rounded object-cover opacity-60"
            />
            <span className="text-2xs text-content-faint">
              REPLAY · Trading Research Platform
            </span>
          </div>
          <div className="flex items-center gap-6 text-2xs text-content-faint">
            <span>
              Chart prices are illustrative. Nothing here is investment advice.
            </span>
            {/* Ürünün gerçek bir kısmı zaten çalışıyor (chart/replay/strateji);
                bu yüzden mevcut kullanıcı için sessiz bir giriş yolu bırakıldı.
                Sayfanın ana CTA'sı yine de waitlist formu. */}
            {isAuthenticated ? (
              // Doğrudan /app'e değil /login'e yönlendirir: zaten girişliyse
              // LoginPage kendi isAuthenticated kontrolüyle anında /app'e
              // atıyor, ama token sessizce geçersiz düşmüşse burada login
              // ekranı görünür — /app'e doğrudan atlamak o durumda kırık bir
              // sayfada bırakırdı.
              <button
                onClick={handleSignInClick}
                className="shrink-0 text-accent-400 font-medium underline decoration-accent-500/30 underline-offset-4 transition-colors hover:text-accent-300 cursor-pointer"
              >
                Go to App →
              </button>
            ) : (
              <button
                onClick={handleSignInClick}
                className="shrink-0 text-content-faint underline decoration-line-strong underline-offset-4 transition-colors hover:text-content-muted cursor-pointer"
              >
                Sign in
              </button>
            )}
          </div>
        </Container>
      </footer>
    </div>
  );
};
