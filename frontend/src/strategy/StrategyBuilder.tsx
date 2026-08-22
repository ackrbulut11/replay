/**
 * StrategyBuilder — Strateji oluşturma/düzenleme paneli.
 *
 * Strateji adı, açıklama, entry/exit kuralları, timeframe filtreleri
 * ve JSON önizleme. Parametreler (`$param_adı`) alanı burada
 * düzenlenmez; mevcut stratejilerin parametreleri backend'de saklanmaya
 * devam eder ve JSON önizlemede/kaydetmede olduğu gibi korunur.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save,
  X,
  Plus,
  Trash2,
  Code,
  ChevronDown,
  ChevronRight,
  Settings2,
  Filter,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import ConditionEditor from './ConditionEditor';
import PatternSearchPanel from './PatternSearchPanel';
import { logEvent, logError } from '../services/eventLog';
import type {
  Strategy,
  StrategyCreateRequest,
  StrategyUpdateRequest,
  StrategyParameter,
  ConditionGroup,
  TimeframeFilter,
  IndicatorInfo,
  PatternRegion,
  SingleEvaluationLogItem,
} from '../types/strategy';
import { createEmptyConditionGroup, TIMEFRAMES } from '../types/strategy';
import { strategyStore, useStrategyStore } from '../store/strategyStore';
import { errorMessage } from '../utils/errors';

interface StrategyBuilderProps {
  strategy: Strategy | null; // null = yeni strateji oluşturma
  indicators: IndicatorInfo[];
  onSaved?: (strategy: Strategy) => void;
  onCancel?: () => void;
  /** Test geçmişinden bir kayıt seçildiğinde tetiklenir (değerlendirme panelini geri yüklemek için). */
  onHistorySelect?: (item: SingleEvaluationLogItem) => void;
  /**
   * Örüntü arama bağlamı (Faz 3.5). Verilmezse panel hiç çizilmez — builder
   * hangi sembolde arama yapılacağını kendi bilmiyor, bu bilgi sayfadan gelir.
   */
  patternSearchContext?: {
    symbol: string;
    provider: string;
    timeframe: string;
    onJumpToRegion?: (region: PatternRegion) => void;
  };
}

export default function StrategyBuilder({
  strategy,
  indicators,
  onSaved,
  onCancel,
  onHistorySelect,
  patternSearchContext,
}: StrategyBuilderProps) {
  const isEditing = strategy !== null;
  const { singleEvalHistory, evaluateResult } = useStrategyStore();

  // Store geçmişi zaten en yeni en üstte olacak şekilde tutuyor.
  const currentStrategyLogs = useMemo(
    () => (strategy ? singleEvalHistory.filter((item) => item.strategy_id === strategy.id) : []),
    [singleEvalHistory, strategy]
  );

  // En başarılı test (en yüksek toplam PnL %) — önizlemede seçili gösterilir.
  const bestLog = useMemo(() => {
    if (currentStrategyLogs.length === 0) return null;
    return currentStrategyLogs.reduce((best, item) =>
      item.total_pnl_percent > best.total_pnl_percent ? item : best
    );
  }, [currentStrategyLogs]);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowShort, setAllowShort] = useState(false);
  const [takeProfitPct, setTakeProfitPct] = useState<number | null>(null);
  const [stopLossPct, setStopLossPct] = useState<number | null>(null);
  // Gerçekleşme ayarları. Varsayılanlar backend ile aynı: 1 bar gecikme
  // (RULES.md §22) ve sıfır maliyet (eski kayıtların anlamı değişmesin).
  const [barDelay, setBarDelay] = useState(1);
  const [commissionBps, setCommissionBps] = useState(0);
  const [slippageBps, setSlippageBps] = useState(0);
  const [parameters, setParameters] = useState<StrategyParameter[]>([]);
  const [entryRules, setEntryRules] = useState<ConditionGroup>(createEmptyConditionGroup());
  const [exitRules, setExitRules] = useState<ConditionGroup>(createEmptyConditionGroup());
  const [timeframeFilters, setTimeframeFilters] = useState<TimeframeFilter[]>([]);

  // UI state
  const [showJson, setShowJson] = useState(false);
  const [showTfFilters, setShowTfFilters] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Mevcut stratejiyi forma yükle
  useEffect(() => {
    if (strategy) {
      setName(strategy.name);
      setDescription(strategy.description);
      setAllowShort(Boolean(strategy.allow_short));
      setTakeProfitPct(strategy.take_profit_pct ?? null);
      setStopLossPct(strategy.stop_loss_pct ?? null);
      setBarDelay(strategy.bar_delay ?? 1);
      setCommissionBps(strategy.commission_bps ?? 0);
      setSlippageBps(strategy.slippage_bps ?? 0);
      setParameters(strategy.parameters || []);
      setEntryRules(strategy.entry_rules || createEmptyConditionGroup());
      setExitRules(strategy.exit_rules || createEmptyConditionGroup());
      setTimeframeFilters(strategy.timeframe_filters || []);
    } else {
      setName('');
      setDescription('');
      setAllowShort(false);
      setTakeProfitPct(null);
      setStopLossPct(null);
      setBarDelay(1);
      setCommissionBps(0);
      setSlippageBps(0);
      setParameters([]);
      setEntryRules(createEmptyConditionGroup());
      setExitRules(createEmptyConditionGroup());
      setTimeframeFilters([]);
    }
    setSaveError(null);
  }, [strategy]);

  // Geçmiş kaydını seç: sonucu store'a yükle + paneli geri yükle
  const selectHistoryItem = (item: SingleEvaluationLogItem) => {
    strategyStore.loadSingleEvalHistoryItem(item);
    onHistorySelect?.(item);
  };
  const selectHistoryItemRef = useRef(selectHistoryItem);
  selectHistoryItemRef.current = selectHistoryItem;

  // Dışarı tıklanınca geçmiş listesini kapat
  useEffect(() => {
    if (!showHistory) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory]);

  // Strateji değiştiğinde en başarılı testi önizlemeye yükle
  useEffect(() => {
    setShowHistory(false);
    if (bestLog) {
      selectHistoryItemRef.current(bestLog);
    }
    // Sadece strateji değişiminde çalışsın; yeni test sonucunu ezmemeli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy?.id]);

  // ─── Timeframe Filtre İşlemleri ─────────────────────────────────────────

  const addTimeframeFilter = () => {
    setTimeframeFilters([
      ...timeframeFilters,
      { timeframe: '4h', logic: 'AND', conditions: [] },
    ]);
  };

  const updateTimeframeFilter = (index: number, filter: TimeframeFilter) => {
    const newFilters = [...timeframeFilters];
    newFilters[index] = filter;
    setTimeframeFilters(newFilters);
  };

  const deleteTimeframeFilter = (index: number) => {
    setTimeframeFilters(timeframeFilters.filter((_, i) => i !== index));
  };

  // ─── Kaydetme ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Strateji adı zorunludur');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      let result: Strategy | null = null;

      if (isEditing && strategy) {
        const updateData: StrategyUpdateRequest = {
          name,
          description,
          allow_short: allowShort,
          take_profit_pct: takeProfitPct,
          stop_loss_pct: stopLossPct,
          bar_delay: barDelay,
          commission_bps: commissionBps,
          slippage_bps: slippageBps,
          parameters,
          entry_rules: entryRules,
          exit_rules: exitRules,
          timeframe_filters: timeframeFilters,
        };
        result = await strategyStore.updateStrategy(strategy.id, updateData);
      } else {
        const createData: StrategyCreateRequest = {
          name,
          description,
          allow_short: allowShort,
          take_profit_pct: takeProfitPct,
          stop_loss_pct: stopLossPct,
          bar_delay: barDelay,
          commission_bps: commissionBps,
          slippage_bps: slippageBps,
          parameters,
          entry_rules: entryRules,
          exit_rules: exitRules,
          timeframe_filters: timeframeFilters,
        };
        result = await strategyStore.createStrategy(createData);
      }

      if (result) {
        logEvent(isEditing ? 'strategy_updated' : 'strategy_created', {
          context: { strategy_id: result.id, name: result.name },
        });
      }

      if (result && onSaved) {
        onSaved(result);
      }

    } catch (err: unknown) {
      setSaveError(errorMessage(err, 'Kaydetme hatası'));
      logError('strategy_save_failed', err, { is_editing: isEditing, name });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── JSON Önizleme ─────────────────────────────────────────────────────

  const getJsonPreview = () => {
    return JSON.stringify(
      {
        name,
        description,
        allow_short: allowShort,
        parameters,
        entry_rules: entryRules,
        exit_rules: exitRules,
        timeframe_filters: timeframeFilters,
      },
      null,
      2
    );
  };

  return (
    <div className="custom-scrollbar flex h-full flex-col overflow-y-auto bg-canvas">
      {/* Üst Başlık ve Aksiyon Barı */}
      <div className="sticky top-0 z-20 flex select-none items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
        <h2 className="flex flex-shrink-0 items-center gap-2 text-sm text-content-strong">
          <Settings2 className="h-3.5 w-3.5 text-content-muted" strokeWidth={1.75} />
          {isEditing ? 'Strateji düzenle' : 'Yeni strateji'}
        </h2>

        {/* Orta: Test Geçmişi (Sadece seçili stratejiye ait) — açılır liste */}
        <div ref={historyRef} className="relative flex-1 min-w-0 mx-2">
          <button
            onClick={() => currentStrategyLogs.length > 0 && setShowHistory(!showHistory)}
            disabled={currentStrategyLogs.length === 0}
            className={`flex w-full max-w-md items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ease-out ${
              currentStrategyLogs.length === 0
                ? 'cursor-default border-line bg-surface text-content-faint'
                : 'border-line-strong bg-surface-raised text-content hover:border-ink-500 hover:bg-surface-hover'
            }`}
            title={
              currentStrategyLogs.length === 0
                ? 'Henüz test kaydı yok'
                : 'Test geçmişini aç/kapat'
            }
          >
            {/* Emoji kaldırıldı — ikon setiyle aynı çizgide değildi ve
                platforma göre bambaşka bir şekil çiziyordu. */}
            <span className="flex-shrink-0 whitespace-nowrap text-2xs text-content-faint">
              Test geçmişi
            </span>

            {currentStrategyLogs.length === 0 ? (
              <span className="truncate text-2xs text-content-faint">
                kayıt yok
              </span>
            ) : (
              <>
                <span className="flex-shrink-0 font-mono text-2xs text-content-faint">
                  {currentStrategyLogs.length}
                </span>
                {/* Önizleme: en başarılı test */}
                {bestLog && (
                  <span className="flex items-center gap-1.5 truncate font-mono">
                    <Trophy className="h-3 w-3 flex-shrink-0 text-warn-400" strokeWidth={1.75} />
                    <span className="text-content-strong">{bestLog.symbol}</span>
                    <span className="text-2xs text-content-faint">{bestLog.timeframe}</span>
                    <span
                      className={
                        bestLog.total_pnl_percent >= 0 ? 'text-profit-400' : 'text-loss-400'
                      }
                    >
                      {bestLog.total_pnl_percent >= 0 ? '+' : ''}
                      {bestLog.total_pnl_percent.toFixed(1)}%
                    </span>
                  </span>
                )}
                <ChevronDown
                  className={`ml-auto h-3.5 w-3.5 flex-shrink-0 text-content-muted transition-transform ease-out ${
                    showHistory ? 'rotate-180' : ''
                  }`}
                  strokeWidth={1.75}
                />
              </>
            )}
          </button>

          {showHistory && currentStrategyLogs.length > 0 && (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-full max-w-md animate-scaleUp overflow-hidden rounded-lg border border-line-strong bg-surface-overlay shadow-lg">
              <div className="custom-scrollbar max-h-72 overflow-y-auto py-1">
                {/* En son test en üstte */}
                {currentStrategyLogs.map((item) => {
                  const isCurrent =
                    evaluateResult?.symbol === item.symbol &&
                    evaluateResult?.timeframe === item.timeframe &&
                    evaluateResult?.strategy_id === item.strategy_id;
                  const isBest = bestLog?.id === item.id;
                  const isPositive = item.total_pnl_percent >= 0;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        selectHistoryItem(item);
                        setShowHistory(false);
                      }}
                      className={`group/row relative flex cursor-pointer items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ease-out ${
                        isCurrent
                          ? 'bg-surface-hover text-content-strong'
                          : 'text-content hover:bg-surface-hover'
                      }`}
                      title={`${item.strategy_name} • ${item.executed_at} tarihinde çalıştırıldı. Tıklayarak sonuçlarını inceleyin.`}
                    >
                      {isCurrent && (
                        <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent-400" />
                      )}
                      <Trophy
                        className={`h-3 w-3 flex-shrink-0 ${isBest ? 'text-warn-400' : 'text-transparent'}`}
                        strokeWidth={1.75}
                      />
                      <span className="text-content-strong">{item.symbol}</span>
                      <span className="text-2xs text-content-faint">{item.timeframe}</span>
                      <span className={isPositive ? 'text-profit-400' : 'text-loss-400'}>
                        {isPositive ? '+' : ''}
                        {item.total_pnl_percent.toFixed(1)}%
                      </span>
                      <span className="ml-auto whitespace-nowrap text-2xs text-content-faint">
                        {item.executed_at}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          strategyStore.deleteSingleEvalHistoryItem(item.id);
                        }}
                        aria-label="Bu testi geçmişten sil"
                        className="flex-shrink-0 rounded p-0.5 text-content-faint opacity-0 transition-colors ease-out hover:bg-loss-950 hover:text-loss-400 focus-visible:opacity-100 group-hover/row:opacity-100"
                        title="Bu testi geçmişten sil"
                      >
                        <X className="h-3 w-3" strokeWidth={1.75} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {currentStrategyLogs.length > 1 && (
                <div className="border-t border-line px-3 py-2">
                  <button
                    onClick={() => {
                      strategyStore.clearSingleEvalHistory(strategy?.id);
                      setShowHistory(false);
                    }}
                    className="text-2xs text-content-faint underline decoration-line-strong underline-offset-2 transition-colors ease-out hover:text-loss-400"
                    title="Bu stratejiye ait tüm geçmişi temizle"
                  >
                    Tüm geçmişi temizle
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sağ Taraf: JSON, İptal & Güncelle Butonları */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowJson(!showJson)}
            aria-pressed={showJson}
            className={`rounded-md border p-1.5 transition-colors ease-out ${
              showJson
                ? 'border-accent-600 bg-accent-950 text-accent-300'
                : 'border-line-strong text-content-muted hover:border-ink-500 hover:bg-surface-hover hover:text-content'
            }`}
            title="JSON önizleme"
          >
            <Code className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-content transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover"
            >
              İptal
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="flex items-center gap-1.5 rounded-md bg-accent-400 px-3.5 py-1.5 text-xs font-medium text-ink-950 transition-colors ease-out hover:bg-accent-300 disabled:cursor-not-allowed disabled:bg-ink-650 disabled:text-content-disabled"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
            {isSaving ? 'Kaydediliyor…' : isEditing ? 'Güncelle' : 'Oluştur'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Hata mesajı */}
        {saveError && (
          <p role="alert" className="rounded-md border border-loss-600/50 bg-loss-950 px-3 py-2 text-xs text-loss-300">
            {saveError}
          </p>
        )}

        {/* Ad ve Açıklama */}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-2xs text-content-faint">Strateji adı</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ör. EMA kesişimi + RSI filtresi"
              className="w-full rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content-strong outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs text-content-faint">Açıklama</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bu kuralın ne aradığını kendinize bir cümleyle anlatın"
              rows={2}
              className="w-full resize-none rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
            />
          </label>
        </div>




        {/* Entry Rules */}
        <ConditionEditor
          group={entryRules}
          onChange={setEntryRules}
          indicators={indicators}
          title="Giriş kuralları — pozisyon açar"
        />

        {/* Örüntü arama (Faz 3.5).
            Giriş kurallarının hemen altında duruyor çünkü sorduğu soru onun
            öncesi: "bu koşul geçmişte kaç kez oluştu?". Kural kurulurken,
            stratejiyi kaydetmeden çalışır. */}
        {patternSearchContext && (
          <PatternSearchPanel
            group={entryRules}
            parameters={parameters}
            symbol={patternSearchContext.symbol}
            provider={patternSearchContext.provider}
            timeframe={patternSearchContext.timeframe}
            onJumpToRegion={patternSearchContext.onJumpToRegion}
          />
        )}

        {/* Exit Rules */}
        <ConditionEditor
          group={exitRules}
          onChange={setExitRules}
          indicators={indicators}
          title="Çıkış kuralları — pozisyonu kapatır"
          kind="exit"
        />

        {/* Kar Al % ve Zarar Durdur % (Çıkış Kurallarının Aşağısında) */}
        {/* Hedefler ve gerçekleşme.
            Önceden her alan üç kat kutu içindeydi: kart → renkli çerçeve →
            input çerçevesi. Şimdi tek bir bölüm, düz etiketli alanlar ve
            açıklamalar `title` ipucunda saklanmak yerine alanın altında.
            Renkli çerçeveler de kalktı — kâr al alanı yeşil olduğu için
            "kârlı" olmuyor, sadece bir eşik değeri. */}
        <section className="rounded-lg border border-line bg-surface">
          <h3 className="border-b border-line-subtle px-3.5 py-2.5 text-xs font-medium text-content-strong">
            Hedefler ve gerçekleşme
          </h3>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-3.5 py-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-2xs text-content-faint">Kâr al (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={takeProfitPct ?? ''}
                onChange={(e) => setTakeProfitPct(e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="3.5"
                className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1.5 font-mono text-sm text-content-strong outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
              />
              <span className="mt-1 block text-2xs leading-relaxed text-content-faint">
                Pozisyon bu kâra ulaşınca kapanır. Boş bırakılırsa hedef yok.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-2xs text-content-faint">Zarar durdur (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={stopLossPct ?? ''}
                onChange={(e) => setStopLossPct(e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="2.0"
                className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1.5 font-mono text-sm text-content-strong outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
              />
              <span className="mt-1 block text-2xs leading-relaxed text-content-faint">
                Bu zarara düşünce kapanır. Kural değil, bekleyen emirdir —
                gecikmeye tabi değil.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-2xs text-content-faint">Emir gecikmesi</span>
              <select
                value={barDelay}
                onChange={(e) => setBarDelay(parseInt(e.target.value, 10))}
                className="w-full cursor-pointer rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
              >
                <option value={1}>1 bar sonra — gerçekçi</option>
                <option value={0}>Aynı mumda — iyimser</option>
              </select>
              <span className="mt-1 block text-2xs leading-relaxed text-content-faint">
                Sinyal kapanan mumdan gelir; emri aynı mumda doldurmak
                gerçekte olamayacak bir fiyat verir.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-2xs text-content-faint">Komisyon (bps)</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={commissionBps}
                  onChange={(e) => setCommissionBps(e.target.value ? parseFloat(e.target.value) : 0)}
                  placeholder="10"
                  className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1.5 font-mono text-sm text-content-strong outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs text-content-faint">Slipaj (bps)</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value ? parseFloat(e.target.value) : 0)}
                  placeholder="5"
                  className="w-full rounded-md border border-line-strong bg-surface-raised px-2.5 py-1.5 font-mono text-sm text-content-strong outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
                />
              </label>
              <span className="col-span-2 -mt-1 block text-2xs leading-relaxed text-content-faint">
                Her iki bacakta da uygulanır. 1 bps = %0,01; Binance spot
                taker ≈ 10 bps.
              </span>
            </div>
          </div>

          {commissionBps === 0 && slippageBps === 0 && (
            <p className="flex items-start gap-2 border-t border-line-subtle px-3.5 py-2.5 text-2xs leading-relaxed text-warn-300">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              Komisyon ve slipaj sıfır. Sonuçlar gerçekte alınabilecek olandan
              iyimser çıkar — özellikle çok işlem üreten kurallarda.
            </p>
          )}
        </section>




        {/* Timeframe Filtreleri.
            Önceden aç/kapa butonunun İÇİNDE "Filtre Ekle" butonu vardı —
            geçersiz HTML ve tıklama hedefleri iç içeydi. İkisi artık kardeş.
            Bölümün amber çerçevesi de kalktı: bir filtre uyarı değil. */}
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <button
              onClick={() => setShowTfFilters(!showTfFilters)}
              aria-expanded={showTfFilters}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              {showTfFilters ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-content-muted" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-muted" strokeWidth={1.75} />
              )}
              <Filter className="h-3.5 w-3.5 shrink-0 text-content-faint" strokeWidth={1.75} />
              <span className="text-xs font-medium text-content-strong">Zaman dilimi filtreleri</span>
              <span className="font-mono text-2xs text-content-faint">{timeframeFilters.length}</span>
            </button>

            <button
              onClick={addTimeframeFilter}
              className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-2xs text-content-muted transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover hover:text-content"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Filtre ekle
            </button>
          </div>

          {showTfFilters && timeframeFilters.length === 0 && (
            <p className="border-t border-line-subtle px-3.5 py-3 text-2xs leading-relaxed text-content-faint">
              Filtre yok. Bir filtre eklerseniz giriş kuralları yalnızca o
              zaman diliminin koşulu da sağlandığında çalışır — örneğin 1
              saatlik sinyali günlük trendle onaylamak için.
            </p>
          )}

          {showTfFilters && timeframeFilters.length > 0 && (
            <div className="space-y-4 border-t border-line-subtle px-3.5 py-3.5">
              {timeframeFilters.map((filter, index) => (
                <div key={index} className="relative">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2">
                      <span className="text-2xs text-content-faint">Zaman dilimi</span>
                      <select
                        value={filter.timeframe}
                        onChange={(e) =>
                          updateTimeframeFilter(index, { ...filter, timeframe: e.target.value })
                        }
                        className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-xs text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
                      >
                        {TIMEFRAMES.map((tf) => (
                          <option key={tf} value={tf}>
                            {tf}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => deleteTimeframeFilter(index)}
                      aria-label="Filtreyi sil"
                      className="rounded p-1 text-content-faint transition-colors ease-out hover:bg-loss-950 hover:text-loss-400"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                    </button>
                  </div>
                  <ConditionEditor
                    group={{ logic: filter.logic, conditions: filter.conditions }}
                    onChange={(group) =>
                      updateTimeframeFilter(index, {
                        ...filter,
                        logic: group.logic,
                        conditions: group.conditions,
                      })
                    }
                    indicators={indicators}
                    title={`${filter.timeframe} filtresi`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* JSON Önizleme */}
        {showJson && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line-subtle px-3.5 py-2.5">
              <Code className="h-3.5 w-3.5 text-content-faint" strokeWidth={1.75} />
              <span className="text-xs font-medium text-content-strong">JSON önizleme</span>
            </div>
            <pre className="custom-scrollbar max-h-80 overflow-auto p-3.5 font-mono text-xs leading-relaxed text-content-muted">
              {getJsonPreview()}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}