/**
 * Replay sırasında manuel işlem paneli (Faz 4).
 *
 * Replay oynatılırken long/short pozisyon açar, stop-loss / take-profit
 * belirler ve pozisyonu kapatır. Panel başlığından sürüklenerek taşınabilir.
 *
 * Kâr/zarar ve seviye hesabı burada YAPILMAZ: finansal hesap mantığı arayüze
 * yazılmaz (RULES.md "Yasaklar"). Yüzdeyle girilen stop/hedef sunucuya yüzde
 * olarak gönderilir; mutlak fiyata çevirme işi `replay_engine` içindedir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, X, Loader2, AlertTriangle, GripHorizontal } from 'lucide-react';

import { advanceTrade, closeTrade, openTrade } from '../services/journalApi';
import type { ReplayBarPayload } from '../services/journalApi';
import { journalStore, useJournalStore } from '../store/journalStore';
import { replayStore, useReplayStore } from '../store/replayStore';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { logError, logEvent } from '../services/eventLog';
import type { TradeSide } from '../types/journal';
import { errorMessage } from '../utils/errors';

/** Stop/hedef kontrolü için gereken mum alanları. */
export interface ReplayBarInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ReplayTradePanelProps {
  symbol: string;
  provider: string;
  timeframe: string;
  /** Replay'in bulunduğu mumun kapanış fiyatı — giriş/çıkış bu fiyattan yapılır. */
  currentPrice?: number;
  currentBarIndex: number | null;
  /** Mumun zamanı (saniye cinsinden epoch, lightweight-charts biçimi). */
  currentBarTime?: number;
  /**
   * Replay'in o ana kadar açığa çıkardığı mumlar (imlecin ilerisi DAHİL DEĞİL).
   *
   * Stop/hedef kontrolü için gerekli: panel yalnızca kapanış fiyatını
   * biliyordu, tetiklenme ise mumun yükseği/düşüğüne bakıyor. Karar yine
   * sunucuda veriliyor (bkz. advanceTrade), buradan yalnızca ham mum geçiyor.
   */
  bars?: ReplayBarInput[];
}

type LevelMode = 'price' | 'percent';

function formatPrice(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 8 });
}

/**
 * Negatif ve hatalı girişleri eler.
 *
 * Fiyat da yüzde de negatif olamaz; kullanıcı "-1" yazdığında sessizce
 * geçersiz sayılır (input `min` özniteliği klavyeyle yazmayı engellemiyor).
 */
function parsePositive(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function ReplayTradePanel({
  symbol,
  provider,
  timeframe,
  currentPrice,
  currentBarIndex,
  currentBarTime,
  bars,
}: ReplayTradePanelProps) {
  const { trades } = useJournalStore();
  // İşlemler açık replay oturumuna bağlanır; panel de yalnızca o oturumun
  // pozisyonlarını görür (bkz. journalStore.reload).
  const [{ sessionId }] = useReplayStore();
  // `trades` yalnızca bu oturuma değil, aynı sembolde daha önce "Kaydet" ile
  // kalıcılaştırılmış işlemlere de sahip olabilir (bkz. journalStore.reload,
  // include_saved). Session filtresi olmadan, eski bir oturumdan kalma ve
  // hâlâ OPEN durumdaki kaydedilmiş bir işlem burada "güncel pozisyon" gibi
  // gösterilir — fiyatı o oturumdan kalma olduğundan ekrandaki anlık fiyatla
  // hiç ilgisi olmaz.
  const position = trades.find((t) => t.status === 'OPEN' && t.session_id === sessionId) ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levelMode, setLevelMode] = useState<LevelMode>('price');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Sürükleme mantığı geçmiş paneliyle ortak (bkz. useDraggablePanel).
  const { panelRef, handleDragStart } = useDraggablePanel();

  // ─── Veri ───────────────────────────────────────────────────────────────
  useEffect(() => {
    journalStore.reload(symbol, sessionId);
    setError(null);
  }, [symbol, sessionId]);

  // ─── Stop-loss / take-profit tetiklemesi ────────────────────────────────
  //
  // Seviyeler eskiden yalnızca KAYDEDİLİYORDU: panelde çiziliyor, grafikte
  // görünüyor ama hiçbir zaman tetiklenmiyordu. Tek kapanış yolu "Kapat"
  // düğmesiydi; kullanıcı stop koyup fiyat oradan geçtiğinde pozisyon açık
  // kalıyordu ve manuel backtest, disiplinli bir stop'un değil "elle kapatana
  // kadar taşı"nın sonucunu ölçüyordu.
  //
  // Karar burada VERİLMEZ (RULES.md: finansal hesap arayüze yazılmaz); geçilen
  // ham mumlar sunucuya gönderilir, tetikleme ve çıkış fiyatı replay_engine'de
  // hesaplanır.
  const lastCheckedBarRef = useRef<number | null>(null);
  const advanceInFlightRef = useRef(false);
  const positionId = position?.id ?? null;
  const positionEntryBar = position?.entry_bar_index ?? null;

  // Yeni pozisyon (ya da oturum değişimi): kontrol imleci sıfırlanır.
  useEffect(() => {
    lastCheckedBarRef.current = null;
  }, [positionId]);

  useEffect(() => {
    if (!positionId || currentBarIndex === null || !bars || bars.length === 0) return;
    if (advanceInFlightRef.current) return;

    // Girişin yapıldığı bar ve öncesi atlanır: kullanıcı o barın kapanışında
    // girdi, o barın yükseği/düşüğü girişten ÖNCE oluşmuştu. Sunucu da aynı
    // kontrolü yapıyor; burada yalnızca boşuna istek atmamak için.
    const entryBar = positionEntryBar ?? -1;
    let from = (lastCheckedBarRef.current ?? entryBar) + 1;
    // Replay geriye sarıldıysa imleç de geri alınır.
    if (currentBarIndex < from - 1) {
      lastCheckedBarRef.current = null;
      from = entryBar + 1;
    }
    const to = Math.min(currentBarIndex, bars.length - 1);
    if (to < from) return;

    const payload: ReplayBarPayload[] = [];
    for (let i = from; i <= to; i++) {
      const bar = bars[i];
      if (!bar) continue;
      payload.push({
        bar_index: i,
        timestamp: new Date(bar.time * 1000).toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
    }
    if (payload.length === 0) return;

    advanceInFlightRef.current = true;
    advanceTrade(positionId, payload)
      .then((updated) => {
        lastCheckedBarRef.current = to;
        if (updated.status === 'CLOSED') {
          // Pozisyon seviyeden kapandı: oynatmayı durdur ve günlüğü tazele,
          // aksi halde kullanıcı kapanmış bir pozisyonu taşıyor sanır.
          replayStore.setState({ isPlaying: false });
          void journalStore.reload(symbol, sessionId);
          logEvent('replay_trade_level_hit', {
            context: { symbol, reason: updated.exit_reason, pnl: updated.pnl },
          });
        }
      })
      .catch((err: unknown) => {
        // Seviye kontrolü "olsa iyi olur": başarısızlığı replay'i durdurmamalı.
        logError('replay_trade_advance_failed', err, { symbol });
      })
      .finally(() => {
        advanceInFlightRef.current = false;
      });
  }, [positionId, positionEntryBar, currentBarIndex, bars, symbol, sessionId]);

  const barTimeIso = currentBarTime ? new Date(currentBarTime * 1000).toISOString() : null;

  const handleOpen = useCallback(
    async (side: TradeSide) => {
      if (!currentPrice || busy) return;

      const stop = parsePositive(stopLoss);
      const target = parsePositive(takeProfit);
      const qty = parsePositive(quantity);
      const byPercent = levelMode === 'percent';

      // Girilmiş ama geçersiz (negatif/sıfır) bir seviyeyi sessizce yok saymak,
      // pozisyonu stop'suz açmak demektir — hata verip işlemi durdur.
      if (stopLoss.trim() && stop === null) {
        setError('Stop pozitif bir değer olmalı.');
        return;
      }
      if (takeProfit.trim() && target === null) {
        setError('Hedef pozitif bir değer olmalı.');
        return;
      }
      if (qty === null) {
        setError('Miktar pozitif bir değer olmalı.');
        return;
      }

      setBusy(true);
      setError(null);
      try {
        // Oturum ön yüklemede açılmış olmalı; olmadıysa (ör. sunucu o an
        // uykudaydı) burada garanti edilir. `journal_trades.session_id`
        // gerçek bir `replay_sessions` satırına yabancı anahtar olduğundan
        // uydurma bir kimlikle pozisyon açılamaz.
        const activeSessionId = await replayStore.ensureSession(symbol, timeframe);

        await openTrade({
          symbol,
          provider,
          timeframe,
          side,
          entry_price: currentPrice,
          quantity: qty,
          // Yüzde modunda çevrimi sunucu yapar (RULES.md "Yasaklar").
          stop_loss: byPercent ? null : stop,
          take_profit: byPercent ? null : target,
          stop_loss_pct: byPercent ? stop : null,
          take_profit_pct: byPercent ? target : null,
          entry_bar_index: currentBarIndex,
          entry_time: barTimeIso,
          session_id: activeSessionId,
        });
        setStopLoss('');
        setTakeProfit('');
        await journalStore.reload(symbol, activeSessionId);
        logEvent('replay_trade_opened', { context: { symbol, side } });
      } catch (err: unknown) {
        setError(errorMessage(err, 'Pozisyon açılamadı.'));
        logError('replay_trade_open_failed', err, { symbol, side });
      } finally {
        setBusy(false);
      }
    },
    [busy, currentPrice, stopLoss, takeProfit, quantity, levelMode, symbol, provider, timeframe, currentBarIndex, barTimeIso]
  );

  const handleClose = useCallback(async () => {
    if (!position || !currentPrice || busy) return;

    setBusy(true);
    setError(null);
    try {
      const closed = await closeTrade(position.id, {
        exit_price: currentPrice,
        exit_bar_index: currentBarIndex,
        exit_time: barTimeIso,
        exit_reason: 'manual',
      });
      await journalStore.reload(symbol, sessionId);
      logEvent('replay_trade_closed', { context: { symbol, pnl: closed.pnl } });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Pozisyon kapatılamadı.'));
      logError('replay_trade_close_failed', err, { symbol });
    } finally {
      setBusy(false);
    }
  }, [position, currentPrice, busy, currentBarIndex, barTimeIso, symbol, sessionId]);

  // Klavye kısayolları: L (long), S (short), K (kapat).
  //
  // Replay'in hızı fareyle sınırlıydı — her işlem için panele nişan almak
  // gerekiyordu. Mum ilerletme zaten boşluk tuşunda (bkz. CandleChart), işlem
  // açma/kapatma da elin klavyeden ayrılmaması için buraya alındı.
  //
  // Dinleyici panelin kendisinde: kısayol yalnızca panel ekrandayken, yani
  // gerçekten işlem yapılabilecek durumdayken çalışsın.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Form alanına yazarken kısayol tetiklenmemeli (stop/hedef girerken
      // "s" yazmak short açardı).
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Tarayıcı/işletim sistemi kısayollarına karışma.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'l' && !position) {
        e.preventDefault();
        void handleOpen('long');
      } else if (key === 's' && !position) {
        e.preventDefault();
        void handleOpen('short');
      } else if (key === 'k' && position) {
        e.preventDefault();
        void handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpen, handleClose, position]);

  const disabled = busy || !currentPrice;
  const levelSuffix = levelMode === 'percent' ? '%' : '';
  // Alanlar dar tutulur: şerit tek satırda kaldığı sürece mumları örtmez.
  const inputClass =
    'w-14 bg-canvas border border-line-strong text-content text-2xs rounded px-1 py-0.5 focus:border-accent-500 outline-none font-mono';
  const fieldLabel = 'text-2xs text-content-faint';

  return (
    // transform JSX'te verilmez; sürükleme sırasında doğrudan DOM'a yazılır ve
    // React'in yeniden render'ı bu değeri sıfırlamasın diye burada tutulmaz.
    //
    // Dikey panel yerine YATAY şerit: eskiden grafiğin sağında duruyor ve fiyat
    // cetvelini kapatıyordu; taşındığında da cetvelin bir bölümü kullanılamaz
    // hâlde kalıyordu. Şerit artık sol altta, cetvelden uzakta durur.
    <div
      ref={panelRef}
      /* Dar ekranda sarmalanır: stop/hedef/miktar alanları + Long/Short
         düğmeleri tek satırda telefona sığmıyor ve işlem açma düğmeleri
         ekranın dışında kalıyordu — manuel backtest'in tam da yapılamaz
         hâle geldiği yer burasıydı. */
      className="flex max-w-full flex-wrap items-center justify-center gap-1.5 bg-canvas border border-white/[0.1] rounded-lg px-1.5 py-1 shadow-2xl backdrop-blur-md text-content-strong select-none"
    >
      {/* Sürükleme tutamacı + anlık fiyat */}
      <div
        onMouseDown={handleDragStart}
        title="Sürükleyerek taşı"
        className="flex items-center gap-1 pr-1.5 border-r border-line cursor-grab active:cursor-grabbing"
      >
        <GripHorizontal className="w-3 h-3 text-content-faint" />
        <span className="text-2xs font-mono text-content-muted tabular-nums">
          {formatPrice(currentPrice)}
        </span>
      </div>

      {position ? (
        <>
          <span className="flex items-center gap-1 text-2xs font-medium">
            {position.side === 'long' ? (
              <TrendingUp className="w-3 h-3 text-profit-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-loss-400" />
            )}
            <span className={position.side === 'long' ? 'text-profit-400' : 'text-loss-400'}>
              {position.side === 'long' ? 'LONG' : 'SHORT'}
            </span>
            <span className="text-content-faint font-mono text-2xs">x{position.quantity ?? 1}</span>
          </span>

          <span className="flex items-center gap-1.5 text-2xs font-mono text-content-faint tabular-nums">
            <span title="Giriş fiyatı">
              G <span className="text-content">{formatPrice(position.entry_price)}</span>
            </span>
            <span title="Stop seviyesi">
              S <span className="text-loss-400/90">{formatPrice(position.stop_loss)}</span>
            </span>
            <span title="Hedef seviyesi">
              H <span className="text-profit-400/90">{formatPrice(position.take_profit)}</span>
            </span>
          </span>

          <button
            type="button"
            onClick={handleClose}
            disabled={disabled}
            title="Pozisyonu kapat (K)"
            className="flex items-center gap-1 px-2 py-1 touch:px-3 touch:py-2 text-2xs font-medium rounded bg-ink-50 text-ink-950 hover:bg-ink-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Kapat
          </button>
        </>
      ) : (
        <>
          {/* Seviye birimi: mutlak fiyat mı, yüzde mi */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-line rounded p-0.5">
            {(['price', 'percent'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setLevelMode(mode)}
                title={mode === 'price' ? 'Seviyeleri fiyat olarak gir' : 'Seviyeleri yüzde olarak gir'}
                className={`px-1.5 py-0.5 text-2xs font-medium rounded transition-colors cursor-pointer ${
                  levelMode === mode
                    ? 'bg-accent-500/20 text-accent-300'
                    : 'text-content-faint hover:text-content'
                }`}
              >
                {mode === 'price' ? 'Fiyat' : 'Yüzde'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1">
            <span className={fieldLabel}>Stop{levelSuffix}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-1">
            <span className={fieldLabel}>Hedef{levelSuffix}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-1">
            <span className={fieldLabel}>Miktar</span>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={() => handleOpen('long')}
            disabled={disabled}
            title="Long pozisyon aç (L)"
            className="flex items-center gap-0.5 px-2 py-1 touch:px-3 touch:py-2 text-2xs font-medium rounded bg-profit-500/15 text-profit-400 border border-profit-500/40 hover:bg-profit-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <TrendingUp className="w-3 h-3" />
            Long
          </button>
          <button
            type="button"
            onClick={() => handleOpen('short')}
            disabled={disabled}
            title="Short pozisyon aç (S)"
            className="flex items-center gap-0.5 px-2 py-1 touch:px-3 touch:py-2 text-2xs font-medium rounded bg-loss-500/15 text-loss-400 border border-loss-500/40 hover:bg-loss-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <TrendingDown className="w-3 h-3" />
            Short
          </button>
        </>
      )}

      {/* "Son işlem" özeti buradan kaldırıldı: aynı bilgi artık geçmiş
          panelinde, tüm işlemlerle birlikte ve tarihleriyle duruyor
          (bkz. ReplayHistoryPanel). */}

      {error && (
        <span className="flex items-center gap-1 pl-1.5 border-l border-line text-2xs text-loss-400 max-w-[220px]">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={error}>
            {error}
          </span>
        </span>
      )}
    </div>
  );
}
