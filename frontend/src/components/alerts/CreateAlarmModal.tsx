import React, { useState, useEffect } from 'react';
import { X, Bell, AlertTriangle, TrendingUp, TrendingDown, Check } from 'lucide-react';
import { alertStore } from '../../store/alertStore';

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
  const [targetType, setTargetType] = useState<'price' | 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'ATR' | 'BollingerBands'>('price');
  const [indicatorPeriod, setIndicatorPeriod] = useState<number>(14);
  const [condition, setCondition] = useState<'rises_above' | 'falls_below'>('rises_above');
  const [thresholdValue, setThresholdValue] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    }
  }, [targetType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(thresholdValue);
    if (isNaN(val)) {
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
        indicator_period: targetType !== 'price' ? indicatorPeriod : undefined,
        condition,
        threshold_value: val,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Alarm oluşturulurken hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0d1321] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-[#070b13]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Fiyat & İndikatör Alarmı Ekle
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {currentSymbol} • {currentProvider.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Target Type Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Alarm Hedefi (Target)
            </label>
            <select
              value={targetType}
              onChange={e => setTargetType(e.target.value as any)}
              className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:outline-none focus:border-amber-500/60 transition"
            >
              <option value="price">Fiyat (Price Level)</option>
              <option value="RSI">RSI Göstergesi</option>
              <option value="EMA">EMA (Exponential Moving Average)</option>
              <option value="SMA">SMA (Simple Moving Average)</option>
              <option value="MACD">MACD</option>
              <option value="ATR">ATR (Average True Range)</option>
              <option value="BollingerBands">Bollinger Bands</option>
            </select>
          </div>

          {/* Indicator Period (if not price) */}
          {targetType !== 'price' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                İndikatör Periyodu (Period)
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={indicatorPeriod}
                onChange={e => setIndicatorPeriod(parseInt(e.target.value) || 14)}
                className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500/60 transition"
              />
            </div>
          )}

          {/* Condition Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Tetiklenme Koşulu (Condition)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCondition('rises_above')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition ${
                  condition === 'rises_above'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                    : 'bg-[#070b13] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Üstüne Çıktığında (&gt;)</span>
              </button>

              <button
                type="button"
                onClick={() => setCondition('falls_below')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition ${
                  condition === 'falls_below'
                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-[#070b13] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                <span>Altına Düştüğünde (&lt;)</span>
              </button>
            </div>
          </div>

          {/* Target Value / Threshold */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Hedef Seviye / Fiyat (Threshold)
              </label>
              {currentPrice && (
                <button
                  type="button"
                  onClick={() => setThresholdValue(currentPrice.toString())}
                  className="text-[10px] text-amber-400 hover:underline font-mono"
                >
                  Son Fiyatı Kullan ({currentPrice})
                </button>
              )}
            </div>
            <input
              type="number"
              step="any"
              required
              value={thresholdValue}
              onChange={e => setThresholdValue(e.target.value)}
              placeholder="Örn: 70000 veya 70"
              className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-slate-100 font-mono focus:outline-none focus:border-amber-500/60 transition"
            />
          </div>

          {/* Note / Description */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Not / Açıklama (İsteğe Bağlı)
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Örn: Direnç kırılımı takibi"
              className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/60 transition"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-lg shadow-amber-600/20 transition disabled:opacity-50"
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
