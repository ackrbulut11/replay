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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0d1321] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#070b13]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100 truncate">
              {INDICATOR_NAMES[indicatorKey]}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-[#090d16] px-5 pt-2 gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('inputs')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-all ${
              activeTab === 'inputs'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
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
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Stil (Renk & Kalınlık)
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'inputs' && (
            <div className="space-y-3">
              {indicatorKey.startsWith('ema') && (
                <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                  <span className="font-medium text-slate-200">EMA Periyodu</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={(currentSettings as any).period}
                    onChange={(e) => updateSetting('period', Math.max(1, Number(e.target.value)))}
                    className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {indicatorKey === 'bb' && (
                <>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Uzunluk (Periyot)</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={(currentSettings as any).period}
                      onChange={(e) => updateSetting('period', Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Standart Sapma (StdDev)</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      max={10}
                      value={(currentSettings as any).stdDev}
                      onChange={(e) => updateSetting('stdDev', Math.max(0.1, Number(e.target.value)))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              )}

              {indicatorKey === 'rsi' && (
                <>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">RSI Uzunluğu (Periyot)</span>
                    <input
                      type="number"
                      min={2}
                      max={100}
                      value={(currentSettings as any).period}
                      onChange={(e) => updateSetting('period', Math.max(2, Number(e.target.value)))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Aşırı Alım Sınırı (Overbought)</span>
                    <input
                      type="number"
                      min={50}
                      max={95}
                      value={(currentSettings as any).overbought}
                      onChange={(e) => updateSetting('overbought', Number(e.target.value))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Aşırı Satım Sınırı (Oversold)</span>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={(currentSettings as any).oversold}
                      onChange={(e) => updateSetting('oversold', Number(e.target.value))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              )}

              {indicatorKey === 'macd' && (
                <>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Hızlı Periyot (Fast EMA)</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={(currentSettings as any).fastPeriod}
                      onChange={(e) => updateSetting('fastPeriod', Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Yavaş Periyot (Slow EMA)</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={(currentSettings as any).slowPeriod}
                      onChange={(e) => updateSetting('slowPeriod', Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-[#070b13] p-3 rounded-xl border border-slate-800">
                    <span className="font-medium text-slate-200">Sinyal Periyodu (Signal)</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={(currentSettings as any).signalPeriod}
                      onChange={(e) => updateSetting('signalPeriod', Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-[#0d1321] border border-slate-700 rounded-lg px-2.5 py-1 text-right text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'style' && (
            <div className="space-y-4">
              {indicatorKey.startsWith('ema') && (
                <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                  {renderColorPicker('Çizgi Rengi', 'color', (currentSettings as any).color)}
                  <div className="w-full h-px bg-slate-800/80 my-2" />
                  {renderWidthSelector('Çizgi Kalınlığı', 'lineWidth', (currentSettings as any).lineWidth)}
                </div>
              )}

              {indicatorKey === 'bb' && (
                <div className="space-y-3">
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-amber-400">Üst Bant</h4>
                    {renderColorPicker('Üst Bant Rengi', 'upperColor', (currentSettings as any).upperColor)}
                    {renderWidthSelector('Üst Bant Kalınlığı', 'upperWidth', (currentSettings as any).upperWidth)}
                  </div>
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-slate-400">Orta Bant (SMA 20)</h4>
                    {renderColorPicker('Orta Bant Rengi', 'middleColor', (currentSettings as any).middleColor)}
                    {renderWidthSelector('Orta Bant Kalınlığı', 'middleWidth', (currentSettings as any).middleWidth)}
                  </div>
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-amber-400">Alt Bant</h4>
                    {renderColorPicker('Alt Bant Rengi', 'lowerColor', (currentSettings as any).lowerColor)}
                    {renderWidthSelector('Alt Bant Kalınlığı', 'lowerWidth', (currentSettings as any).lowerWidth)}
                  </div>
                </div>
              )}

              {indicatorKey === 'rsi' && (
                <div className="space-y-3">
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-sky-400">RSI Çizgisi</h4>
                    {renderColorPicker('RSI Rengi', 'color', (currentSettings as any).color)}
                    {renderWidthSelector('RSI Kalınlığı', 'lineWidth', (currentSettings as any).lineWidth)}
                  </div>
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-slate-300">Sınır ve Seviye Çizgileri</h4>
                    {renderColorPicker('Üst Çizgi (Aşırı Alım)', 'overboughtColor', (currentSettings as any).overboughtColor)}
                    {renderColorPicker('Orta Çizgi (50)', 'middleColor', (currentSettings as any).middleColor)}
                    {renderColorPicker('Alt Çizgi (Aşırı Satım)', 'oversoldColor', (currentSettings as any).oversoldColor)}
                  </div>
                </div>
              )}

              {indicatorKey === 'macd' && (
                <div className="space-y-3">
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-blue-400">MACD Çizgisi</h4>
                    {renderColorPicker('MACD Rengi', 'macdColor', (currentSettings as any).macdColor)}
                    {renderWidthSelector('MACD Kalınlığı', 'macdWidth', (currentSettings as any).macdWidth)}
                  </div>
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-amber-400">Sinyal Çizgisi</h4>
                    {renderColorPicker('Sinyal Rengi', 'signalColor', (currentSettings as any).signalColor)}
                    {renderWidthSelector('Sinyal Kalınlığı', 'signalWidth', (currentSettings as any).signalWidth)}
                  </div>
                  <div className="bg-[#070b13] p-3 rounded-xl border border-slate-800 space-y-2">
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-[#070b13]">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Varsayılana Sıfırla
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-md"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
