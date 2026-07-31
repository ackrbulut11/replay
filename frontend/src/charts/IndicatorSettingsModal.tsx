import { useState } from 'react';
import { X, RotateCcw, Check, Sliders, Palette } from 'lucide-react';
import {
  chartSettingsStore,
  useChartSettingsStore,
} from '../store/chartSettingsStore';
import type { IndicatorSettingsMap } from '../store/chartSettingsStore';

interface IndicatorSettingsModalProps {
  isOpen: boolean;
  indicatorKey: keyof IndicatorSettingsMap | null;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#38bdf8', // Sky Blue
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#ef4444', // Red
  '#eab308', // Yellow
  '#ffffff', // White
  '#94a3b8', // Slate/Gray
  '#f97316', // Orange
];

const INDICATOR_NAMES: Record<keyof IndicatorSettingsMap, string> = {
  ema20: 'EMA 20 (Üstel Hareketli Ortalama)',
  ema50: 'EMA 50 (Üstel Hareketli Ortalama)',
  ema100: 'EMA 100 (Üstel Hareketli Ortalama)',
  ema200: 'EMA 200 (Üstel Hareketli Ortalama)',
  bb: 'Bollinger Bantları (Bollinger Bands)',
  rsi: 'RSI (Göreceli Güç Endeksi)',
  macd: 'MACD (Hareketli Ortalama Yakınlaşma Iraksama)',
};

export default function IndicatorSettingsModal({
  isOpen,
  indicatorKey,
  onClose,
}: IndicatorSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'inputs' | 'style'>('inputs');
  const [settingsState] = useChartSettingsStore();

  if (!isOpen || !indicatorKey) return null;

  const currentSettings = settingsState.indicators[indicatorKey];

  const handleReset = () => {
    chartSettingsStore.resetIndicatorSettings(indicatorKey);
  };

  const updateSetting = (field: string, value: any) => {
    chartSettingsStore.setIndicatorSettings(indicatorKey, { [field]: value });
  };

  const renderColorPicker = (label: string, field: string, value: string) => {
    return (
      <div className="flex flex-col gap-1.5 py-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">{label}</span>
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full border border-slate-600 shadow-xs"
              style={{ backgroundColor: value }}
            />
            <input
              type="color"
              value={value.startsWith('rgba') ? '#94a3b8' : value}
              onChange={(e) => updateSetting(field, e.target.value)}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => updateSetting(field, c)}
              style={{ backgroundColor: c }}
              className={`w-5 h-5 rounded-md transition-transform hover:scale-110 flex items-center justify-center ${
                value === c ? 'ring-2 ring-indigo-400 scale-105' : 'opacity-80 hover:opacity-100'
              }`}
            >
              {value === c && <Check className="w-3 h-3 text-black drop-shadow-xs" />}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderWidthSelector = (label: string, field: string, value: number) => {
    return (
      <div className="flex items-center justify-between py-1 text-xs text-slate-300">
        <span>{label}</span>
        <div className="flex items-center gap-1 bg-[#070b13] p-1 rounded-lg border border-slate-800">
          {[1, 2, 3, 4].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => updateSetting(field, w)}
              className={`px-2 py-0.5 text-xs font-semibold rounded transition-all ${
                value === w
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0a0b0e] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#0a0b0e]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100 truncate">
              {INDICATOR_NAMES[indicatorKey]}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/[0.06] bg-[#0a0b0e] px-5 pt-2 gap-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('inputs')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-all ${
              activeTab === 'inputs'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Girdiler (Parametreler)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('style')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-all ${
              activeTab === 'style'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Stil (Renk & Kalınlık)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'inputs' ? (
            <div className="space-y-4">
              {(indicatorKey === 'ema20' || indicatorKey === 'ema50' || indicatorKey === 'ema100' || indicatorKey === 'ema200') && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium">Periyot (Period)</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={(currentSettings as any).period}
                    onChange={(e) => updateSetting('period', parseInt(e.target.value) || 20)}
                    className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}

              {indicatorKey === 'bb' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Periyot (Period)</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={(currentSettings as any).period}
                      onChange={(e) => updateSetting('period', parseInt(e.target.value) || 20)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Standart Sapma (StdDev)</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      max={10}
                      value={(currentSettings as any).stdDev}
                      onChange={(e) => updateSetting('stdDev', parseFloat(e.target.value) || 2)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </>
              )}

              {indicatorKey === 'rsi' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">RSI Periyodu</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={(currentSettings as any).period}
                      onChange={(e) => updateSetting('period', parseInt(e.target.value) || 14)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Aşırı Alım Seviyesi (Overbought)</span>
                    <input
                      type="number"
                      min={50}
                      max={95}
                      value={(currentSettings as any).overbought}
                      onChange={(e) => updateSetting('overbought', parseInt(e.target.value) || 75)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Aşırı Satım Seviyesi (Oversold)</span>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={(currentSettings as any).oversold}
                      onChange={(e) => updateSetting('oversold', parseInt(e.target.value) || 25)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </>
              )}

              {indicatorKey === 'macd' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Hızlı Periyot (Fast Period)</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={(currentSettings as any).fastPeriod}
                      onChange={(e) => updateSetting('fastPeriod', parseInt(e.target.value) || 12)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Yavaş Periyot (Slow Period)</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={(currentSettings as any).slowPeriod}
                      onChange={(e) => updateSetting('slowPeriod', parseInt(e.target.value) || 26)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Sinyal Periyodu (Signal Period)</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={(currentSettings as any).signalPeriod}
                      onChange={(e) => updateSetting('signalPeriod', parseInt(e.target.value) || 9)}
                      className="w-24 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-right text-zinc-100 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {(indicatorKey === 'ema20' || indicatorKey === 'ema50' || indicatorKey === 'ema100' || indicatorKey === 'ema200') && (
                <div className="space-y-3">
                  {renderColorPicker('Çizgi Rengi', 'color', (currentSettings as any).color)}
                  {renderWidthSelector('Çizgi Kalınlığı', 'lineWidth', (currentSettings as any).lineWidth)}
                </div>
              )}

              {indicatorKey === 'bb' && (
                <div className="space-y-3">
                  {renderColorPicker('Üst Bant Rengi', 'upperColor', (currentSettings as any).upperColor)}
                  {renderColorPicker('Orta Bant Rengi', 'middleColor', (currentSettings as any).middleColor)}
                  {renderColorPicker('Alt Bant Rengi', 'lowerColor', (currentSettings as any).lowerColor)}
                </div>
              )}

              {indicatorKey === 'rsi' && (
                <div className="space-y-3">
                  {renderColorPicker('RSI Çizgi Rengi', 'color', (currentSettings as any).color)}
                  {renderWidthSelector('RSI Çizgi Kalınlığı', 'lineWidth', (currentSettings as any).lineWidth)}
                </div>
              )}

              {indicatorKey === 'macd' && (
                <div className="space-y-3">
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06] space-y-2">
                    <h4 className="text-xs font-bold text-emerald-400">MACD Çizgisi</h4>
                    {renderColorPicker('MACD Rengi', 'macdColor', (currentSettings as any).macdColor)}
                    {renderWidthSelector('MACD Kalınlığı', 'macdWidth', (currentSettings as any).macdWidth)}
                  </div>
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06] space-y-2">
                    <h4 className="text-xs font-bold text-amber-400">Sinyal Çizgisi</h4>
                    {renderColorPicker('Sinyal Rengi', 'signalColor', (currentSettings as any).signalColor)}
                    {renderWidthSelector('Sinyal Kalınlığı', 'signalWidth', (currentSettings as any).signalWidth)}
                  </div>
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06] space-y-2">
                    <h4 className="text-xs font-bold text-emerald-400">Histogram Çubukları</h4>
                    {renderColorPicker('Yükseliş Rengi', 'histUpColor', (currentSettings as any).histUpColor)}
                    {renderColorPicker('Düşüş Rengi', 'histDownColor', (currentSettings as any).histDownColor)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-[#0a0b0e]">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Varsayılana Sıfırla
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-emerald-400 rounded-lg transition-colors shadow-xs"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
