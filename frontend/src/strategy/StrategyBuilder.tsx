/**
 * StrategyBuilder — Strateji oluşturma/düzenleme paneli.
 *
 * Strateji adı, açıklama, entry/exit kuralları, parametreler,
 * timeframe filtreleri ve JSON önizleme.
 */

import { useState, useEffect } from 'react';
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
  Info,
} from 'lucide-react';
import ConditionEditor from './ConditionEditor';
import type {
  Strategy,
  StrategyCreateRequest,
  StrategyUpdateRequest,
  StrategyParameter,
  ConditionGroup,
  TimeframeFilter,
  IndicatorInfo,
} from '../types/strategy';
import { createEmptyConditionGroup, TIMEFRAMES } from '../types/strategy';
import { strategyStore } from '../store/strategyStore';

interface StrategyBuilderProps {
  strategy: Strategy | null; // null = yeni strateji oluşturma
  indicators: IndicatorInfo[];
  onSaved?: (strategy: Strategy) => void;
  onCancel?: () => void;
}

export default function StrategyBuilder({
  strategy,
  indicators,
  onSaved,
  onCancel,
}: StrategyBuilderProps) {
  const isEditing = strategy !== null;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowShort, setAllowShort] = useState(false);
  const [parameters, setParameters] = useState<StrategyParameter[]>([]);
  const [entryRules, setEntryRules] = useState<ConditionGroup>(createEmptyConditionGroup());
  const [exitRules, setExitRules] = useState<ConditionGroup>(createEmptyConditionGroup());
  const [timeframeFilters, setTimeframeFilters] = useState<TimeframeFilter[]>([]);

  // UI state
  const [showJson, setShowJson] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [showTfFilters, setShowTfFilters] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mevcut stratejiyi forma yükle
  useEffect(() => {
    if (strategy) {
      setName(strategy.name);
      setDescription(strategy.description);
      setAllowShort(Boolean(strategy.allow_short));
      setParameters(strategy.parameters || []);
      setEntryRules(strategy.entry_rules || createEmptyConditionGroup());
      setExitRules(strategy.exit_rules || createEmptyConditionGroup());
      setTimeframeFilters(strategy.timeframe_filters || []);
    } else {
      setName('');
      setDescription('');
      setAllowShort(false);
      setParameters([]);
      setEntryRules(createEmptyConditionGroup());
      setExitRules(createEmptyConditionGroup());
      setTimeframeFilters([]);
    }
    setSaveError(null);
  }, [strategy]);

  // ─── Parametre İşlemleri ────────────────────────────────────────────────

  const addParameter = () => {
    setParameters([
      ...parameters,
      {
        name: `param_${parameters.length + 1}`,
        type: 'int',
        default: 14,
        min: 1,
        max: 500,
        description: '',
      },
    ]);
  };

  const updateParameter = (index: number, param: StrategyParameter) => {
    const newParams = [...parameters];
    newParams[index] = param;
    setParameters(newParams);
  };

  const deleteParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

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
          parameters,
          entry_rules: entryRules,
          exit_rules: exitRules,
          timeframe_filters: timeframeFilters,
        };
        result = await strategyStore.createStrategy(createData);
      }

      if (result && onSaved) {
        onSaved(result);
      }
    } catch (err: any) {
      setSaveError(err.message || 'Kaydetme hatası');
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
    <div className="flex flex-col h-full bg-[#070b13] overflow-y-auto custom-scrollbar">
      {/* Başlık */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#0a0e1a]/95 backdrop-blur-md border-b border-slate-800/60">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-indigo-400" />
          {isEditing ? 'Strateji Düzenle' : 'Yeni Strateji'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJson(!showJson)}
            className={`p-1.5 rounded-lg border transition-all ${
              showJson
                ? 'text-amber-300 bg-amber-500/15 border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 border-slate-700/60 hover:bg-slate-800/60'
            }`}
            title="JSON Önizleme"
          >
            <Code className="w-4 h-4" />
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg border border-slate-700/60 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Hata mesajı */}
        {saveError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-400">
            {saveError}
          </div>
        )}

        {/* Ad ve Açıklama */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
              Strateji Adı
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ör. EMA Cross + RSI Filter"
              className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-colors placeholder:text-slate-600"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
              Açıklama
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Strateji açıklaması..."
              rows={2}
              className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-colors resize-none placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Parametreler (İsteğe Bağlı Değişkenler) */}
        <div className="border border-slate-800/60 rounded-xl overflow-hidden bg-slate-900/20">
          <button
            onClick={() => setShowParams(!showParams)}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showParams ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Parametreler (İsteğe Bağlı)
              </span>
              <span className="text-[10px] text-slate-500 bg-slate-800/80 px-1.5 py-0.2 rounded-full">{parameters.length}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addParameter();
                setShowParams(true);
              }}
              className="flex items-center gap-1 text-[10px] font-semibold text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-md px-2 py-0.5 transition-all"
            >
              <Plus className="w-3 h-3" />
              Ekle
            </button>
          </button>
          {showParams && (
            <div className="px-3 pb-3 border-t border-slate-800/40 pt-2.5 space-y-2.5">
              {/* Bilgilendirme Kutusu */}
              <div className="bg-indigo-950/30 border border-indigo-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-indigo-200/90">
                <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-indigo-300 text-xs">💡 Bu Alan Ne İşe Yarar?</p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>Zorunlu değildir!</strong> İndikatör periyotlarınızı (örneğin RSI 14, EMA 20) aşağıdaki kurallar kısmında doğrudan sayı olarak yazabilirsiniz. Bu parametre alanı, aynı değeri birden fazla kuralda ortak kullanmak veya ileride otomatik test/optimizasyon yapmak isteyenler içindir.
                  </p>
                </div>
              </div>

              {parameters.length === 0 ? (
                <div className="text-center py-2.5 text-[11px] text-slate-500 italic bg-slate-900/30 rounded-lg border border-slate-800/30">
                  Henüz tanımlı parametre yok. İndikatör değerlerinizi aşağıdaki kurallar ekranından doğrudan girebilirsiniz.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Başlık Etiketleri */}
                  <div className="grid grid-cols-12 gap-2 px-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    <span className="col-span-3">Parametre Adı</span>
                    <span className="col-span-3">Veri Türü</span>
                    <span className="col-span-2">Varsayılan</span>
                    <span className="col-span-3">Sınır Aralığı (Min - Max)</span>
                    <span className="col-span-1 text-right">Sil</span>
                  </div>

                  {parameters.map((param, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-2 items-center bg-slate-900/60 border border-slate-800/80 rounded-lg p-2 hover:border-slate-700/80 transition-colors"
                    >
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={param.name}
                          onChange={(e) => updateParameter(index, { ...param, name: e.target.value })}
                          placeholder="Örn: rsi_period"
                          className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded px-2 py-1 focus:border-indigo-500 outline-none font-mono"
                          title="Parametrenin adı (Örn: rsi_period)"
                        />
                      </div>
                      <div className="col-span-3">
                        <select
                          value={param.type}
                          onChange={(e) =>
                            updateParameter(index, {
                              ...param,
                              type: e.target.value as 'int' | 'float',
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-[11px] rounded px-1.5 py-1 outline-none"
                        >
                          <option value="int">Tam Sayı (int)</option>
                          <option value="float">Ondalık (float)</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={param.default}
                          onChange={(e) =>
                            updateParameter(index, { ...param, default: Number(e.target.value) })
                          }
                          placeholder="Değer"
                          className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded px-1.5 py-1 focus:border-indigo-500 outline-none font-mono"
                          title="Varsayılan başlangıç değeri"
                        />
                      </div>
                      <div className="col-span-3 flex items-center gap-1">
                        <input
                          type="number"
                          value={param.min ?? ''}
                          onChange={(e) =>
                            updateParameter(index, {
                              ...param,
                              min: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          placeholder="Min (1)"
                          className="w-full bg-slate-950 border border-slate-700/80 text-slate-400 text-xs rounded px-1.5 py-1 focus:border-indigo-500 outline-none font-mono"
                          title="En düşük değer"
                        />
                        <span className="text-slate-600">-</span>
                        <input
                          type="number"
                          value={param.max ?? ''}
                          onChange={(e) =>
                            updateParameter(index, {
                              ...param,
                              max: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          placeholder="Max (500)"
                          className="w-full bg-slate-950 border border-slate-700/80 text-slate-400 text-xs rounded px-1.5 py-1 focus:border-indigo-500 outline-none font-mono"
                          title="En yüksek değer"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          onClick={() => deleteParameter(index)}
                          className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Parametreyi Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Entry Rules */}
        <ConditionEditor
          group={entryRules}
          onChange={setEntryRules}
          indicators={indicators}
          title="Giriş Kuralları (BUY)"
          accentColor="emerald"
        />

        {/* Exit Rules */}
        <ConditionEditor
          group={exitRules}
          onChange={setExitRules}
          indicators={indicators}
          title="Çıkış Kuralları (SELL)"
          accentColor="red"
        />

        {/* Timeframe Filtreleri */}
        <div className="border border-amber-600/30 bg-amber-950/15 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowTfFilters(!showTfFilters)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showTfFilters ? (
                <ChevronDown className="w-3.5 h-3.5 text-amber-400/60" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-amber-400/60" />
              )}
              <Filter className="w-3.5 h-3.5 text-amber-400/60" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300/80">
                Timeframe Filtreleri
              </span>
              <span className="text-[10px] text-slate-500">{timeframeFilters.length}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addTimeframeFilter();
              }}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-lg px-2 py-0.5 transition-all"
            >
              <Plus className="w-3 h-3" />
              Filtre Ekle
            </button>
          </button>

          {showTfFilters && timeframeFilters.length > 0 && (
            <div className="px-3 pb-3 space-y-3 border-t border-amber-800/30 pt-3">
              {timeframeFilters.map((filter, index) => (
                <div key={index} className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={filter.timeframe}
                        onChange={(e) =>
                          updateTimeframeFilter(index, { ...filter, timeframe: e.target.value })
                        }
                        className="bg-slate-900 border border-amber-700/40 text-amber-300 text-xs rounded-lg px-2 py-1 focus:border-amber-500 outline-none font-semibold"
                      >
                        {TIMEFRAMES.map((tf) => (
                          <option key={tf} value={tf}>
                            {tf}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-500">timeframe filtresi</span>
                    </div>
                    <button
                      onClick={() => deleteTimeframeFilter(index)}
                      className="p-1 text-red-400/50 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
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
                    title={`${filter.timeframe} Filtre`}
                    accentColor="amber"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* JSON Önizleme */}
        {showJson && (
          <div className="border border-amber-600/30 bg-[#0d1117] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60">
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                JSON Önizleme
              </span>
            </div>
            <pre className="p-3 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar leading-relaxed">
              {getJsonPreview()}
            </pre>
          </div>
        )}
      </div>

      {/* Kaydet Butonu */}
      <div className="sticky bottom-0 px-4 py-3 bg-[#0a0e1a]/95 backdrop-blur-md border-t border-slate-800/60 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-all"
          >
            İptal
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-indigo-500/20"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Kaydediliyor...' : isEditing ? 'Güncelle' : 'Oluştur'}
        </button>
      </div>
    </div>
  );
}