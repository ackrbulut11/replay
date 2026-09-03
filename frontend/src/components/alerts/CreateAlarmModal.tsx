import React, { useState, useEffect } from 'react';
import { X, Bell, AlertTriangle, TrendingUp, TrendingDown, Check } from 'lucide-react';
import { alertStore } from '../../store/alertStore';
import { logEvent, logError } from '../../services/eventLog';
import { errorMessage } from '../../utils/errors';
import { useDialogFocus } from '../../hooks/useDialogFocus';

/** Alarmın neyi izlediği. Backend `AlertTargetType` ile aynı küme. */
type AlertTargetType =
  | 'price'
  | 'EMA'
  | 'SMA'
  | 'RSI'
  | 'MACD'
  | 'ATR'
  | 'BollingerBands'
  | 'EMA_CROSS'
  | 'PERCENT_CHANGE';

interface CreateAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol: string;
  currentProvider: string;
  currentPrice?: number;
}

export default function CreateAlarmModal({
  isOpen,
  onClose,
  currentSymbol,
  currentProvider,
  currentPrice,
}: CreateAlarmModalProps) {
  const [targetType, setTargetType] = useState<AlertTargetType>('price');
  const [indicatorPeriod, setIndicatorPeriod] = useState<number>(14);
  const [indicatorPeriodFast, setIndicatorPeriodFast] = useState<number>(20);
  const [indicatorPeriodSlow, setIndicatorPeriodSlow] = useState<number>(50);
  const [condition, setCondition] = useState<'rises_above' | 'falls_below'>('rises_above');
  const [thresholdValue, setThresholdValue] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dialogRef = useDialogFocus(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (currentPrice !== undefined && currentPrice !== null) {
        setThresholdValue(currentPrice.toString());
      } else {
        setThresholdValue('');
      }
    }
  }, [isOpen, currentPrice]);

  useEffect(() => {
    if (targetType === 'RSI' || targetType === 'ATR') {
      setIndicatorPeriod(14);
      if (targetType === 'RSI') setThresholdValue('70');
    } else if (targetType === 'EMA' || targetType === 'SMA' || targetType === 'BollingerBands') {
      setIndicatorPeriod(20);
    } else if (targetType === 'EMA_CROSS') {
      setIndicatorPeriodFast(20);
      setIndicatorPeriodSlow(50);
      setThresholdValue('0');
    } else if (targetType === 'PERCENT_CHANGE') {
      setThresholdValue('2');
    }
  }, [targetType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(thresholdValue);
    if (isNaN(val) && targetType !== 'EMA_CROSS') {
      setErrorMsg('Lütfen geçerli bir sayısal hedef değer giriniz.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await alertStore.createAlert({
        symbol: currentSymbol,
        provider: currentProvider,
        target_type: targetType,
        indicator_period: targetType !== 'price' && targetType !== 'EMA_CROSS' && targetType !== 'PERCENT_CHANGE' ? indicatorPeriod : undefined,
        indicator_period_fast: targetType === 'EMA_CROSS' ? indicatorPeriodFast : undefined,
        indicator_period_slow: targetType === 'EMA_CROSS' ? indicatorPeriodSlow : undefined,
        condition,
        threshold_value: targetType === 'EMA_CROSS' ? 0 : val,
        note: note.trim() || undefined,
      });
      logEvent('alert_created', { context: { symbol: currentSymbol, target_type: targetType } });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err, 'Alarm oluşturulurken hata oluştu.'));
      logError('alert_create_failed', err, { symbol: currentSymbol, target_type: targetType });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-alarm-title"
        tabIndex={-1}
        className="bg-surface-raised border border-line rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-canvas">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-warn-500/10 border border-warn-500/30 text-warn-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 id="create-alarm-title" className="text-sm font-medium text-content-strong flex items-center gap-2">
                Fiyat & İndikatör Alarmı Ekle
              </h3>
              <p className="text-2xs text-content-muted font-mono">
                {currentSymbol} • {currentProvider.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Alarm penceresini kapat"
            className="p-1.5 text-content-muted hover:text-content hover:bg-surface-hover rounded-xl transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-loss-500/10 border border-loss-500/30 flex items-center gap-2 text-xs text-loss-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Target Type Selector */}
          <div>
            <label className="block text-2xs font-medium text-content-muted mb-1.5">
              Alarm Hedefi (Target)
            </label>
            <select
              aria-label="Alarm hedefi"
              value={targetType}
              onChange={e => setTargetType(e.target.value as AlertTargetType)}
              className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content font-medium focus:outline-none focus:border-warn-500/60 transition"
            >
              <option value="price">Fiyat (Price Level)</option>
              <option value="EMA_CROSS">EMA Kesişimi (Golden / Death Cross)</option>
              <option value="PERCENT_CHANGE">Yüzdelik Değişim (% Change)</option>
              <option value="RSI">RSI Göstergesi</option>
              <option value="EMA">EMA (Exponential Moving Average)</option>
              <option value="SMA">SMA (Simple Moving Average)</option>
              <option value="MACD">MACD</option>
              <option value="ATR">ATR (Average True Range)</option>
              <option value="BollingerBands">Bollinger Bands</option>
            </select>
          </div>

          {/* EMA Cross Fast/Slow Inputs */}
          {targetType === 'EMA_CROSS' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-2xs font-medium text-content-muted mb-1.5">
                  Hızlı EMA (Fast)
                </label>
                <input
                  aria-label="Hızlı EMA periyodu"
                  type="number"
                  min="1"
                  max="500"
                  value={indicatorPeriodFast}
                  onChange={e => setIndicatorPeriodFast(parseInt(e.target.value) || 20)}
                  className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content font-mono focus:outline-none focus:border-warn-500/60 transition"
                />
              </div>
              <div>
                <label className="block text-2xs font-medium text-content-muted mb-1.5">
                  Yavaş EMA (Slow)
                </label>
                <input
                  aria-label="Yavaş EMA periyodu"
                  type="number"
                  min="1"
                  max="500"
                  value={indicatorPeriodSlow}
                  onChange={e => setIndicatorPeriodSlow(parseInt(e.target.value) || 50)}
                  className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content font-mono focus:outline-none focus:border-warn-500/60 transition"
                />
              </div>
            </div>
          )}

          {/* Indicator Period (if standard indicator) */}
          {targetType !== 'price' && targetType !== 'EMA_CROSS' && targetType !== 'PERCENT_CHANGE' && (
            <div>
              <label className="block text-2xs font-medium text-content-muted mb-1.5">
                İndikatör Periyodu (Period)
              </label>
              <input
                aria-label="İndikatör periyodu"
                type="number"
                min="1"
                max="500"
                value={indicatorPeriod}
                onChange={e => setIndicatorPeriod(parseInt(e.target.value) || 14)}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content font-mono focus:outline-none focus:border-warn-500/60 transition"
              />
            </div>
          )}

          {/* Condition Selector */}
          <div>
            <label className="block text-2xs font-medium text-content-muted mb-1.5">
              Tetiklenme Koşulu (Condition)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCondition('rises_above')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition ${
                  condition === 'rises_above'
                    ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
                    : 'bg-canvas border-line text-content-muted hover:text-content'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Üstüne Çıktığında (&gt;)</span>
              </button>

              <button
                type="button"
                onClick={() => setCondition('falls_below')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition ${
                  condition === 'falls_below'
                    ? 'bg-loss-500/20 border-loss-500/50 text-loss-400'
                    : 'bg-canvas border-line text-content-muted hover:text-content'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                <span>Altına Düştüğünde (&lt;)</span>
              </button>
            </div>
          </div>

          {/* Target Value / Threshold */}
          {targetType !== 'EMA_CROSS' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-2xs font-medium text-content-muted">
                  {targetType === 'PERCENT_CHANGE' ? 'Yüzdelik Değişim Oranı (%)' : 'Hedef Seviye / Fiyat (Threshold)'}
                </label>
                {currentPrice && targetType === 'price' && (
                  <button
                    type="button"
                    onClick={() => setThresholdValue(currentPrice.toString())}
                    className="text-2xs text-warn-400 hover:underline font-mono"
                  >
                    Son Fiyatı Kullan ({currentPrice})
                  </button>
                )}
              </div>
              <input
                aria-label="Hedef seviye"
                type="number"
                step="any"
                required
                value={thresholdValue}
                onChange={e => setThresholdValue(e.target.value)}
                placeholder={targetType === 'PERCENT_CHANGE' ? 'Örn: 2 (%2 değişim)' : 'Örn: 70000 veya 70'}
                className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-sm font-medium text-content-strong font-mono focus:outline-none focus:border-warn-500/60 transition"
              />
            </div>
          )}

          {/* Note / Description */}
          <div>
            <label className="block text-2xs font-medium text-content-muted mb-1.5">
              Not / Açıklama (İsteğe Bağlı)
            </label>
            <input
              aria-label="Alarm notu"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Örn: Direnç kırılımı takibi"
              className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content focus:outline-none focus:border-warn-500/60 transition"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-content-muted hover:text-content hover:bg-surface-hover rounded-xl transition"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-warn-600 hover:bg-warn-500 rounded-xl shadow-lg shadow-warn-600/20 transition disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Alarmı Oluştur</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
