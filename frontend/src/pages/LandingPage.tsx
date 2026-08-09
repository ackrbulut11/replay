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
const WaitlistForm: React.FC<{ source: WaitlistSource; note?: string }> = ({
  source,
  note,
}) => {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

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
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to submit. Please try again.');
    }
  };

  if (status === 'done') {
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-[13px] text-emerald-400">
        <Check size={16} className="shrink-0 text-emerald-400" />
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
          className="h-11 w-full rounded-md border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-500/60 focus:bg-white/[0.05] sm:max-w-[290px]"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-zinc-100 px-5 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending' : 'Join the list'}
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </form>
      {status === 'error' && (
        <p className="mt-2.5 text-[12px] text-red-400/90">{message}</p>
      )}
      {note && <p className="mt-3 text-[12px] leading-relaxed text-zinc-600">{note}</p>}
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

/**
 * Bölüm üstü küçük etiket. Metin doğrudan büyük harf yazılır; sayfada
 * `text-transform: uppercase` kullanılmıyor.
 */
const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-mono text-[10px] tracking-[0.22em] text-zinc-500">
    {children}
  </span>
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

  const handleSignInClick = () => {
    if (onLogin) {
      onLogin();
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-zinc-100 antialiased">
      {/* Üst çubuk bilerek sticky değil: aşağı kaydırınca sayfayla birlikte
          kaybolur, boş yere ekranda yer kaplamaz. */}
      <header className="border-b border-white/[0.06]">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img
              src={logoImg}
              alt=""
              className="h-7 w-7 rounded-md object-cover opacity-90"
            />
            <span
              className="text-[13px] font-extrabold tracking-[0.14em] bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(90deg, rgba(42, 123, 155, 1) 0%, rgba(87, 199, 133, 1) 30%, rgba(151, 79, 196, 1) 88%)',
              }}
            >
              REPLAY
            </span>
          </Link>

          {!isAuthenticated && (
            <div>
              <button
                onClick={handleSignInClick}
                className="text-[12.5px] font-medium text-zinc-400 transition-colors hover:text-zinc-100"
              >
                Sign in
              </button>
            </div>
          )}
        </Container>
      </header>

      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Grafiğin arkasında tek bir ışık; sayfanın geri kalanı düz. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-10%] top-[-10%] h-[520px] w-[620px] rounded-full bg-emerald-500/[0.14] blur-[120px]"
        />
        <Container className="relative grid grid-cols-1 items-center gap-14 pb-20 pt-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-12 lg:pb-28 lg:pt-24">
          <div>
            <Eyebrow>EARLY ACCESS · IN DEVELOPMENT</Eyebrow>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[44px] lg:text-[50px]">
              One rule.
              <br />
              Every symbol.
              <br />
              {/* Satır sonu bilinçli: cümle zaten bu genişlikte iki satıra
                  düşüyor, kırılma yerini şansa bırakmamak için sabitlendi. */}
              <span className="text-zinc-500">
                Tested on history,
                <br />
                not on your money.
              </span>
            </h1>
            <p className="mt-6 max-w-[440px] text-[14px] leading-[1.75] text-zinc-400">
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
              />
            </div>
          </div>

          <div className="lg:pl-2">
            <ReplayPreview />
          </div>
        </Container>
      </section>

      {/* ─── Gerçek sayılar şeridi ─────────────────────────────────────── */}
      <section className="border-y border-white/[0.06]">
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
              <div className="text-[15px] font-medium tracking-tight text-zinc-100">
                {title}
              </div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
                {sub}
              </div>
            </div>
          ))}
        </Container>
      </section>

      {/* ─── Nasıl çalışır ─────────────────────────────────────────────── */}
      <section className="border-b border-white/[0.06] py-20 lg:py-28">
        <Container>
          <Eyebrow>HOW IT WORKS</Eyebrow>
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
                <span className="font-mono text-[11px] tracking-[0.1em] text-zinc-600">
                  {step.no}
                </span>
                <h3 className="mt-4 text-[15px] font-medium tracking-tight text-zinc-100">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.7] text-zinc-400">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── Strateji testi + toplu tarama ─────────────────────────────── */}
      <section className="border-b border-white/[0.06] py-20 lg:py-28">
        <Container className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>STRATEGY ENGINE</Eyebrow>
            <h2 className="mt-5 text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
              Backtest one symbol. Scan them all.
            </h2>
            <p className="mt-6 max-w-[440px] text-[14px] leading-[1.75] text-zinc-400">
              Backtest on one symbol, then send the same rule across your whole
              watchlist in one batch. Each symbol returns its own trades, win rate,
              PnL and latest signal.
            </p>
          </div>

          {/* Gerçek batch-evaluate yanıt şekli; alan adları
              BatchEvaluateResultItem (backend/app/rules/strategy_models.py)
              ile birebir aynı. Sayılar temsilîdir, gerçek çalışma değildir. */}
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0c0d11]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
                BATCH SCAN
              </span>
              <span className="text-[10px] text-zinc-600">4 symbols · 1h</span>
            </div>
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-zinc-600">
                  <th className="px-4 py-2 font-normal">Symbol</th>
                  <th className="px-3 py-2 text-right font-normal">Trades</th>
                  <th className="px-3 py-2 text-right font-normal">Win rate</th>
                  <th className="px-3 py-2 text-right font-normal">PnL</th>
                  <th className="px-4 py-2 text-right font-normal">Last signal</th>
                </tr>
              </thead>
              <tbody className="font-mono text-zinc-300">
                {[
                  ['BTCUSDT', 14, 64.3, 18.9, 'BUY'],
                  ['ETHUSDT', 11, 45.5, -3.2, 'FLAT'],
                  ['SOLUSDT', 19, 57.9, 26.4, 'BUY'],
                  ['XRPUSDT', 9, 33.3, -8.1, 'FLAT'],
                ].map(([symbol, trades, winRate, pnl, signal]) => (
                  <tr key={symbol as string} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2.5 text-zinc-100">{symbol}</td>
                    <td className="px-3 py-2.5 text-right">{trades}</td>
                    <td className="px-3 py-2.5 text-right">{(winRate as number).toFixed(1)}%</td>
                    <td
                      className="px-3 py-2.5 text-right"
                      style={{ color: (pnl as number) >= 0 ? '#3ecf8e' : '#ef5f6b' }}
                    >
                      {(pnl as number) >= 0 ? '+' : ''}
                      {pnl}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500">{signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] leading-relaxed text-zinc-600">
              Example output shape &mdash; your numbers depend on the rule and the
              range you run it over.
            </div>
          </div>
        </Container>
      </section>

      {/* ─── Lookahead bias ────────────────────────────────────────────── */}
      <section className="border-b border-white/[0.06] py-20 lg:py-28">
        <Container className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>DESIGN DECISION</Eyebrow>
            <h2 className="mt-5 text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
              A backtest that cannot see the future.
            </h2>
            <p className="mt-6 max-w-[440px] text-[14px] leading-[1.75] text-zinc-400">
              Forward-looking access is banned by design: indicators stay blank
              until warm-up, signals only ever come from a closed bar. Backtest,
              scan and replay share one engine.
            </p>
          </div>

          {/* Gerçek kural ağacı; alan adları motorun okuduklarıyla birebir aynı. */}
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0c0d11]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                entry_rules
              </span>
              <span className="text-[10px] text-zinc-600">RSI reversal + trend filter</span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[11.5px] leading-[1.85] text-zinc-500">
              <code>
                {'{\n'}
                {'  '}<span className="text-zinc-300">"logic"</span>{': '}<span className="text-emerald-300/80">"AND"</span>{',\n'}
                {'  '}<span className="text-zinc-300">"conditions"</span>{': [\n'}
                {'    {\n'}
                {'      '}<span className="text-zinc-300">"left"</span>{':     { '}<span className="text-zinc-400">"type"</span>{': '}<span className="text-emerald-300/80">"indicator"</span>{', '}<span className="text-zinc-400">"name"</span>{': '}<span className="text-emerald-300/80">"RSI"</span>{',\n'}
                {'                   '}<span className="text-zinc-400">"period"</span>{': '}<span className="text-amber-200/70">"$rsi_period"</span>{' },\n'}
                {'      '}<span className="text-zinc-300">"operator"</span>{': '}<span className="text-emerald-300/80">"cross_above"</span>{',\n'}
                {'      '}<span className="text-zinc-300">"right"</span>{':    { '}<span className="text-zinc-400">"type"</span>{': '}<span className="text-emerald-300/80">"value"</span>{', '}<span className="text-zinc-400">"value"</span>{': '}<span className="text-sky-300/80">30</span>{' }\n'}
                {'    },\n'}
                {'    {\n'}
                {'      '}<span className="text-zinc-300">"left"</span>{':     { '}<span className="text-zinc-400">"type"</span>{': '}<span className="text-emerald-300/80">"price"</span>{', '}<span className="text-zinc-400">"field"</span>{': '}<span className="text-emerald-300/80">"close"</span>{' },\n'}
                {'      '}<span className="text-zinc-300">"operator"</span>{': '}<span className="text-emerald-300/80">"&gt;"</span>{',\n'}
                {'      '}<span className="text-zinc-300">"right"</span>{':    { '}<span className="text-zinc-400">"type"</span>{': '}<span className="text-emerald-300/80">"indicator"</span>{', '}<span className="text-zinc-400">"name"</span>{': '}<span className="text-emerald-300/80">"EMA"</span>{',\n'}
                {'                   '}<span className="text-zinc-400">"period"</span>{': '}<span className="text-sky-300/80">200</span>{' }\n'}
                {'    }\n'}
                {'  ]\n'}
                {'}'}
              </code>
            </pre>
            <div className="border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] leading-relaxed text-zinc-600">
              <span className="text-amber-200/60">$rsi_period</span> is a strategy
              parameter &mdash; the value changes in the UI, the rule stays the same.
            </div>
          </div>
        </Container>
      </section>

      {/* ─── Durum ─────────────────────────────────────────────────────── */}
      <section className="border-b border-white/[0.06] py-20 lg:py-28">
        <Container>
          <Eyebrow>WHERE IT STANDS</Eyebrow>
          <h2 className="mt-5 max-w-[560px] text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[30px]">
            Half of it is built. Here is exactly which half.
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
            <div>
              <div className="flex items-center gap-2.5 border-b border-white/[0.06] pb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[12px] font-medium tracking-wide text-zinc-300">
                  Working today
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {SHIPPED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[13.5px] text-zinc-300">
                    <Check size={14} className="mt-[3px] shrink-0 text-emerald-400/80" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2.5 border-b border-white/[0.06] pb-3">
                <span className="h-1.5 w-1.5 rounded-full border border-zinc-600" />
                <span className="text-[12px] font-medium tracking-wide text-zinc-500">
                  Roadmap
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {PLANNED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[13.5px] text-zinc-500">
                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full border border-zinc-700" />
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
          <p className="mx-auto mt-4 max-w-[420px] text-[14px] leading-[1.75] text-zinc-400">
            The engine, replay and batch scans are already available. We&rsquo;ll
            email you when the rest is ready.
          </p>
          <div className="mt-8 flex justify-center">
            <WaitlistForm source="footer" />
          </div>
        </Container>
      </section>

      {/* ─── Alt bilgi ─────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-8">
        <Container className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <img
              src={logoImg}
              alt=""
              className="h-5 w-5 rounded object-cover opacity-60"
            />
            <span className="text-[11.5px] text-zinc-600">
              REPLAY · Trading Research Platform
            </span>
          </div>
          <div className="flex items-center gap-6 text-[11.5px] text-zinc-600">
            <span>
              Chart prices are illustrative. Nothing here is investment advice.
            </span>
            {/* Ürünün gerçek bir kısmı zaten çalışıyor (chart/replay/strateji);
                bu yüzden mevcut kullanıcı için sessiz bir giriş yolu bırakıldı.
                Sayfanın ana CTA'sı yine de waitlist formu. */}
            {isAuthenticated ? (
              <Link
                to="/app"
                className="shrink-0 text-emerald-400 font-medium underline decoration-emerald-500/30 underline-offset-4 transition-colors hover:text-emerald-300"
              >
                Go to App →
              </Link>
            ) : (
              <button
                onClick={handleSignInClick}
                className="shrink-0 text-zinc-600 underline decoration-zinc-800 underline-offset-4 transition-colors hover:text-zinc-400 cursor-pointer"
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
