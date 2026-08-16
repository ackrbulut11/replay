import React from 'react';

/**
 * Landing page hero'sundaki replay önizlemesi.
 *
 * Ürünün tek cümlelik anlatımı görsel olarak burada: barlar soldan sağa tek tek
 * açılır, oynatma çizgisinin sağı boştur. Yani grafiğin devamı görünmez.
 * Statik bir çizim değil, ürünün kendisinin sadeleştirilmiş hâli.
 *
 * Veri sabit tohumlu üreticiden gelir — her render'da aynı seri çıkar, böylece
 * tasarım kaymaz. Gerçek piyasa verisi değildir, temsilîdir.
 */

const BAR_COUNT = 52;
/** Oynatma bu barda başlar; öncesi "yüklenmiş geçmiş" olarak görünür. */
const FIRST_VISIBLE = 13;
const ENTRY_BAR = 17;
const EXIT_BAR = 44;

/** Bir barın açılma süresi (ms). */
const STEP_MS = 130;

interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function buildSeries(): Bar[] {
  let seed = 20260419;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const bars: Bar[] = [];
  let price = 104;

  for (let i = 0; i < BAR_COUNT; i++) {
    // İlk bölüm düşüş, ENTRY_BAR civarında dip, sonrası yükseliş.
    // Bar içi oynaklık (wave + gürültü) trendden belirgin biçimde büyük tutuldu:
    // aksi halde toplam fiyat aralığı bar hareketlerini bastırıyor ve gövdeler
    // 1-2 piksele inip mumlar çizgi gibi görünüyor.
    const trend = i < ENTRY_BAR ? -0.5 : 0.62;
    const wave = Math.sin(i / 5.5) * 1.1;
    const open = price;
    const close = open + trend + wave + (rnd() - 0.5) * 3.6;
    bars.push({
      open,
      close,
      high: Math.max(open, close) + rnd() * 1.2,
      low: Math.min(open, close) - rnd() * 1.2,
      // Hacim barın boyuna bağlı: gerçek grafiklerde büyük mumun hacmi de
      // büyüktür. Tamamen rastgele verildiğinde hepsi aynı boya çıkıp alt
      // şeritte duvar gibi görünüyordu.
      volume: 0.12 + Math.abs(close - open) / 4 + rnd() * 0.3,
    });
    price = close;
  }

  return bars;
}

const SERIES = buildSeries();

// ─── Geometri ────────────────────────────────────────────────────────────────
const VIEW_W = 640;
const VIEW_H = 272;
const PLOT = { x0: 8, x1: 566, y0: 12, y1: 190 };
const VOL = { y0: 216, y1: 260 };
const AXIS_X = 576;

const STEP = (PLOT.x1 - PLOT.x0) / BAR_COUNT;
const BODY_W = STEP * 0.62;

const PRICE_MIN = Math.min(...SERIES.map((b) => b.low)) - 1.5;
const PRICE_MAX = Math.max(...SERIES.map((b) => b.high)) + 1.5;
const VOL_MAX = Math.max(...SERIES.map((b) => b.volume));

const cx = (i: number) => PLOT.x0 + STEP * (i + 0.5);
const py = (p: number) =>
  PLOT.y1 - ((p - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * (PLOT.y1 - PLOT.y0);
const vy = (v: number) => VOL.y1 - (v / VOL_MAX) * (VOL.y1 - VOL.y0);

const UP = '#3ecf8e';
const DOWN = '#ef5f6b';

/** Eksen etiketleri: sabit dört seviye, animasyon sırasında yerinden oynamaz. */
const AXIS_LEVELS = [0.08, 0.36, 0.64, 0.92].map(
  (f) => PRICE_MIN + (PRICE_MAX - PRICE_MIN) * f
);

/**
 * Temsilî fiyat ölçeği. Seri 104 civarında üretiliyor, ekranda BTC gibi
 * görünmesi için 100.000 tabanına taşınıyor.
 *
 * Çarpan bilinçli olarak küçük: seri doğrudan 1000 ile ölçeklendiğinde 52
 * saatlik barda %23'lük bir değişim çıkıyordu ve bu hedef kitlenin gözünde
 * anında sahte görünüyor. 320 ile aynı grafik şekli ~%6 değişime karşılık
 * gelir — 1 saatlik BTC için inandırıcı bir aralık.
 */
const BASE_PRICE = 100000;
const PRICE_SCALE = 320;

const displayPrice = (p: number) => BASE_PRICE + (p - SERIES[0].open) * PRICE_SCALE;

/** Landing page İngilizce olduğu için binlik ayırıcı da en-US. */
const formatPrice = (p: number) =>
  Math.round(displayPrice(p)).toLocaleString('en-US');

export const ReplayPreview: React.FC = () => {
  const [revealed, setRevealed] = React.useState(FIRST_VISIBLE);
  // Oynatma bir kez biter ve orada durur; tekrar oynatmak tıklama gerektirir
  // (replayKey'i artırıp efekti yeniden tetikler) — otomatik döngü yok.
  const [done, setDone] = React.useState(false);
  const [replayKey, setReplayKey] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(BAR_COUNT);
      setDone(true);
      return;
    }

    let frame = 0;
    let last = performance.now();
    let index = FIRST_VISIBLE;
    setRevealed(FIRST_VISIBLE);
    setDone(false);

    const tick = (now: number) => {
      if (now - last < STEP_MS) {
        frame = requestAnimationFrame(tick);
        return;
      }
      last = now;

      if (index >= BAR_COUNT) {
        setDone(true);
        return;
      }
      index += 1;
      setRevealed(index);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replayKey]);

  const handleReplay = () => {
    if (!done) return;
    setReplayKey((k) => k + 1);
  };

  const visible = SERIES.slice(0, revealed);
  const lastBar = visible[visible.length - 1];
  // Değişim oranı ekrandaki fiyatlardan hesaplanır; ham seriden hesaplanınca
  // başlıktaki yüzde ile eksendeki fiyatlar birbirini tutmuyor.
  const firstShown = displayPrice(SERIES[0].close);
  const changePct = ((displayPrice(lastBar.close) - firstShown) / firstShown) * 100;
  const playheadX = PLOT.x0 + STEP * revealed;

  const positionOpen = revealed > ENTRY_BAR && revealed <= EXIT_BAR;
  const positionClosed = revealed > EXIT_BAR;
  const entryY = py(SERIES[ENTRY_BAR].close);

  return (
    <div
      onClick={handleReplay}
      role={done ? 'button' : undefined}
      aria-label={done ? 'Replay the chart preview' : undefined}
      className={`select-none rounded-xl border bg-surface-raised shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] transition-colors ${
        done
          ? 'cursor-pointer border-line hover:border-accent-400/25'
          : 'border-line'
      }`}
    >
      {/* Başlık şeridi */}
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-sm font-medium tracking-tight text-content-strong">
            BTCUSDT
          </span>
          <span className="text-2xs text-content-faint">1h</span>
          <span className="hidden items-center gap-1.5 rounded border border-accent-400/20 bg-accent-400/[0.07] px-2 py-0.5 sm:inline-flex">
            <span className="h-1 w-1 rounded-full bg-accent-400" />
            <span className="text-2xs font-medium text-accent-300/90">
              replay
            </span>
          </span>
        </div>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-sm font-medium text-content-strong">
            {formatPrice(lastBar.close)}
          </span>
          <span
            className="text-2xs"
            style={{ color: changePct >= 0 ? UP : DOWN }}
          >
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Grafik */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full"
        aria-label="Candlestick chart preview revealing one bar at a time in replay mode"
        role="img"
      >
        {/* Yatay ızgara + fiyat ekseni. Son fiyat etiketiyle çakışan seviyenin
            yazısı gizlenir; ikisi üst üste binince okunmuyordu. */}
        {AXIS_LEVELS.map((level) => (
          <g key={level}>
            <line
              x1={PLOT.x0}
              x2={PLOT.x1}
              y1={py(level)}
              y2={py(level)}
              stroke="#ffffff"
              strokeOpacity="0.05"
            />
            {Math.abs(py(level) - py(lastBar.close)) > 13 && (
              <text
                x={AXIS_X}
                y={py(level) + 3.5}
                fill="#71717a"
                fontSize="9.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {formatPrice(level)}
              </text>
            )}
          </g>
        ))}

        {/* Oynatma çizgisinin sağı: henüz açılmamış bölge */}
        <rect
          x={playheadX}
          y={PLOT.y0}
          width={Math.max(0, PLOT.x1 - playheadX)}
          height={VOL.y1 - PLOT.y0}
          fill="#ffffff"
          fillOpacity="0.015"
        />

        {/* Açık pozisyon çizgisi — oynatma ilerledikçe uzar */}
        {(positionOpen || positionClosed) && (
          <line
            x1={cx(ENTRY_BAR)}
            x2={positionClosed ? cx(EXIT_BAR) : playheadX}
            y1={entryY}
            y2={entryY}
            stroke={UP}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Mumlar ve hacim */}
        {visible.map((bar, i) => {
          const color = bar.close >= bar.open ? UP : DOWN;
          const bodyTop = py(Math.max(bar.open, bar.close));
          const bodyH = Math.max(1, py(Math.min(bar.open, bar.close)) - bodyTop);
          const isLast = i === visible.length - 1;

          return (
            <g key={i} opacity={i < FIRST_VISIBLE ? 0.55 : 1}>
              <line
                x1={cx(i)}
                x2={cx(i)}
                y1={py(bar.high)}
                y2={py(bar.low)}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={cx(i) - BODY_W / 2}
                y={bodyTop}
                width={BODY_W}
                height={bodyH}
                fill={color}
                rx="0.5"
              />
              <rect
                x={cx(i) - BODY_W / 2}
                y={vy(bar.volume)}
                width={BODY_W}
                height={VOL.y1 - vy(bar.volume)}
                fill={color}
                fillOpacity={isLast ? 0.5 : 0.22}
              />
            </g>
          );
        })}

        {/* Giriş / çıkış işaretleri */}
        {revealed > ENTRY_BAR && (
          <g>
            <path
              d={`M${cx(ENTRY_BAR)} ${py(SERIES[ENTRY_BAR].low) - 5} l4.5 7 l-9 0 z`}
              fill={UP}
            />
            <text
              x={cx(ENTRY_BAR)}
              y={py(SERIES[ENTRY_BAR].low) + 17}
              fill={UP}
              fontSize="9"
              fontWeight="600"
              textAnchor="middle"
            >
              BUY
            </text>
          </g>
        )}
        {positionClosed && (
          <g>
            <path
              d={`M${cx(EXIT_BAR)} ${py(SERIES[EXIT_BAR].high) + 5} l4.5 -7 l-9 0 z`}
              fill={DOWN}
            />
            <text
              x={cx(EXIT_BAR)}
              y={py(SERIES[EXIT_BAR].high) - 11}
              fill={DOWN}
              fontSize="9"
              fontWeight="600"
              textAnchor="middle"
            >
              SELL
            </text>
          </g>
        )}

        {/* Son fiyat çizgisi ve etiketi */}
        <line
          x1={PLOT.x0}
          x2={playheadX}
          y1={py(lastBar.close)}
          y2={py(lastBar.close)}
          stroke="#a1a1aa"
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
        <rect
          x={AXIS_X - 4}
          y={py(lastBar.close) - 7.5}
          width={62}
          height={15}
          rx="2"
          fill="#e4e4e7"
        />
        <text
          x={AXIS_X}
          y={py(lastBar.close) + 3.5}
          fill="#0c0d11"
          fontSize="9.5"
          fontWeight="600"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {formatPrice(lastBar.close)}
        </text>

        {/* Oynatma çizgisi */}
        <line
          x1={playheadX}
          x2={playheadX}
          y1={PLOT.y0}
          y2={VOL.y1}
          stroke="#e4e4e7"
          strokeOpacity="0.5"
          strokeWidth="1"
        />
        <circle cx={playheadX} cy={PLOT.y0} r="2.5" fill="#e4e4e7" />
      </svg>

      {/* Alt şerit: kaynak + ilerleme */}
      <div className="border-t border-line">
        <div className="h-px w-full bg-white/[0.06]">
          <div
            className="h-px bg-accent-400/70"
            style={{ width: `${(revealed / BAR_COUNT) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 text-2xs text-content-faint">
          <span>Source: Binance · parquet cache</span>
          {/* Bar sayacı bittiğinde de kalır (son değerde donar); yalnızca
              "click to replay" gibi ekstra bir metin eklenmiyor. Tıklanabilirlik
              kart kenarlığı ve cursor-pointer ile (aria-label ekran okuyucular
              için ayrıca kalır). */}
          <span className="tabular-nums">bar {revealed} / {BAR_COUNT}</span>
        </div>
      </div>
    </div>
  );
};
