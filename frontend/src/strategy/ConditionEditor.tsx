/**
 * ConditionEditor — Koşul satırı editörü.
 *
 * [Sol Operand ▼] [Operatör ▼] [Sağ Operand ▼]
 * AND/OR grup mantığı, koşul ekleme/silme.
 */

import { Plus, Trash2, GripVertical } from 'lucide-react';

import type {
  Condition,
  ConditionGroup,
  Operand,
  OperatorType,
  IndicatorInfo,
} from '../types/strategy';
import { OPERATORS, PRICE_FIELDS, TIMEFRAMES } from '../types/strategy';

// ─── Operand Editörü ─────────────────────────────────────────────────────────

interface OperandEditorProps {
  operand: Operand;
  onChange: (operand: Operand) => void;
  indicators: IndicatorInfo[];
  label: string;
}

const PRICE_FIELD_MAP: Record<string, string> = {
  close: 'Kapanış (Close)',
  open: 'Açılış (Open)',
  high: 'En Yüksek (High)',
  low: 'En Düşük (Low)',
  volume: 'Hacim (Volume)',
};

function OperandEditor({ operand, onChange, indicators, label }: OperandEditorProps) {
  const type = operand.type;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
        {/* Hızlı Tip Değiştirici Butonlar */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => onChange({ type: 'indicator', name: 'EMA', period: 20 })}
            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-all ${
              type === 'indicator'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="İndikatör seç (EMA, RSI, MACD vs.)"
          >
            İndikatör
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: 'value', value: 30 })}
            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-all ${
              type === 'value'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Sabit Sayı / Seviye gir (30, 70 vs.)"
          >
            Sabit Sayı
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: 'price', field: 'close' })}
            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-all ${
              type === 'price'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Fiyat alanı seç (Kapanış, Hacim vs.)"
          >
            Fiyat
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Tip seçici */}
        <select
          value={type}
          onChange={(e) => {
            const newType = e.target.value as Operand['type'];
            if (newType === 'indicator') {
              onChange({ type: 'indicator', name: 'EMA', period: 20 });
            } else if (newType === 'price') {
              onChange({ type: 'price', field: 'close' });
            } else {
              onChange({ type: 'value', value: 30 });
            }
          }}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-colors"
        >
          <option value="indicator">İndikatör</option>
          <option value="price">Fiyat</option>
          <option value="value">Sabit Sayı / Değer</option>
        </select>

        {/* İndikatör seçici */}
        {type === 'indicator' && (
          <>
            <select
              value={operand.name}
              onChange={(e) => {
                const ind = indicators.find((i) => i.name === e.target.value);
                onChange({
                  ...operand,
                  name: e.target.value,
                  period: ind?.default_period ?? 20,
                  field: undefined,
                });
              }}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 outline-none transition-colors"
            >
              {indicators.map((ind) => (
                <option key={ind.name} value={ind.name}>
                  {ind.display_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={String(operand.period)}
              onChange={(e) => {
                const val = e.target.value;
                onChange({
                  ...operand,
                  period: val.startsWith('$') ? val : parseInt(val) || operand.period,
                });
              }}
              placeholder="Periyot (ör: 20)"
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 w-24 focus:border-indigo-500 outline-none transition-colors font-mono"
              title="İndikatör periyodu (örneğin: 14 veya 20). Gelişmiş kullanıcılar: $param_adı"
            />
            {/* Çoklu çıktılı indikatörlerde alan seçimi */}
            {indicators.find((i) => i.name === operand.name)?.fields?.length ? (
              <select
                value={operand.field || ''}
                onChange={(e) => onChange({ ...operand, field: e.target.value || undefined })}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 outline-none transition-colors"
              >
                <option value="">Varsayılan Çıktı</option>
                {indicators
                  .find((i) => i.name === operand.name)
                  ?.fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            ) : null}
            {/* Timeframe override */}
            <select
              value={operand.timeframe || ''}
              onChange={(e) => onChange({ ...operand, timeframe: e.target.value || undefined })}
              className="bg-slate-900 border border-slate-700 text-slate-400 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 outline-none transition-colors"
              title="Farklı zaman dilimi (Opsiyonel)"
            >
              <option value="">Ana TF</option>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Fiyat seçici */}
        {type === 'price' && (
          <>
            <select
              value={operand.field}
              onChange={(e) => onChange({ ...operand, field: e.target.value })}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 outline-none transition-colors"
            >
              {PRICE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {PRICE_FIELD_MAP[f] || f}
                </option>
              ))}
            </select>
            <select
              value={operand.timeframe || ''}
              onChange={(e) => onChange({ ...operand, timeframe: e.target.value || undefined })}
              className="bg-slate-900 border border-slate-700 text-slate-400 text-xs rounded-lg px-2 py-1.5 focus:border-indigo-500 outline-none transition-colors"
            >
              <option value="">Ana TF</option>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Sabit değer girişi */}
        {type === 'value' && (
          <input
            type="text"
            value={String(operand.value)}
            onChange={(e) => {
              const val = e.target.value;
              onChange({
                ...operand,
                value: val.startsWith('$') ? val : parseFloat(val) || 0,
              });
            }}
            placeholder="Sayı (ör: 30)"
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 w-28 focus:border-indigo-500 outline-none transition-colors font-mono"
            title="Sabit sayısal değer (örneğin: 30, 70, 0)"
          />
        )}
      </div>
    </div>
  );
}

// ─── Tek Koşul Satırı ────────────────────────────────────────────────────────

interface ConditionRowProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onDelete: () => void;
  indicators: IndicatorInfo[];
  index: number;
  isSellGroup?: boolean;
}

function ConditionRow({
  condition,
  onChange,
  onDelete,
  indicators,
  index,
  isSellGroup = false,
}: ConditionRowProps) {
  // Solda indikatör seçildiğinde sağ tarafı otomatik seviyeye/sabit sayıya geçir
  const handleLeftChange = (left: Operand) => {
    let newRight = condition.right;
    let newOperator = condition.operator;

    if (left.type === 'indicator') {
      const name = left.name.toUpperCase();
      if (name === 'RSI') {
        newRight = { type: 'value', value: isSellGroup ? 70 : 30 };
        newOperator = isSellGroup ? '>' : '<';
      } else if (name === 'ADX') {
        newRight = { type: 'value', value: 25 };
        newOperator = '>';
      } else if (name === 'ATR') {
        newRight = { type: 'value', value: 2.5 };
        newOperator = '>';
      } else if (name === 'STOCH' || name.includes('STOCH')) {
        newRight = { type: 'value', value: isSellGroup ? 80 : 20 };
        newOperator = isSellGroup ? '>' : '<';
      } else if (condition.right.type === 'indicator' && name !== 'EMA' && name !== 'SMA' && name !== 'MACD') {
        newRight = { type: 'value', value: 30 };
      }
    }

    onChange({
      ...condition,
      left,
      right: newRight,
      operator: newOperator,
    });
  };

  return (
    <div className="group relative flex flex-col gap-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 hover:border-slate-700/80 transition-colors">
      {/* Satır başlığı */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-[10px] text-slate-500 font-mono font-bold">#{index + 1}</span>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          title="Koşulu sil"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
        {/* Sol operand */}
        <OperandEditor
          operand={condition.left}
          onChange={handleLeftChange}
          indicators={indicators}
          label="Sol"
        />

        {/* Operatör */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Operatör</span>
          <select
            value={condition.operator}
            onChange={(e) => onChange({ ...condition, operator: e.target.value as OperatorType })}
            className="bg-indigo-950/50 border border-indigo-700/50 text-indigo-300 text-xs rounded-lg px-3 py-1.5 font-semibold focus:border-indigo-500 outline-none transition-colors"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value} className="bg-[#0d1321] text-slate-100 py-1">
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sağ operand */}
        <OperandEditor
          operand={condition.right}
          onChange={(right) => onChange({ ...condition, right })}
          indicators={indicators}
          label="Sağ"
        />

        {/* Between için ikinci sağ operand */}
        {condition.operator === 'between' && (
          <OperandEditor
            operand={condition.right2 || { type: 'value', value: 100 }}
            onChange={(right2) => onChange({ ...condition, right2 })}
            indicators={indicators}
            label="Üst Sınır"
          />
        )}
      </div>
    </div>
  );
}

// ─── Ana ConditionEditor ─────────────────────────────────────────────────────

interface ConditionEditorProps {
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  indicators: IndicatorInfo[];
  title: string;
  accentColor?: string;
}

export default function ConditionEditor({
  group,
  onChange,
  indicators,
  title,
  accentColor = 'indigo',
}: ConditionEditorProps) {
  const isSellGroup = accentColor === 'red';

  const colorMap: Record<string, string> = {
    indigo: 'border-indigo-600/40 bg-indigo-950/20',
    emerald: 'border-emerald-600/40 bg-emerald-950/20',
    red: 'border-red-600/40 bg-red-950/20',
    amber: 'border-amber-600/40 bg-amber-950/20',
  };

  const badgeMap: Record<string, string> = {
    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    red: 'bg-red-500/20 text-red-300 border-red-500/40',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  };

  // Yeni eklenen koşul her zaman en üste gelir (0. indekse prepend)
  const handleAddCondition = () => {
    const defaultNewCond: Condition = {
      left: { type: 'indicator', name: 'RSI', period: 14 },
      operator: isSellGroup ? '>' : '<',
      right: { type: 'value', value: isSellGroup ? 70 : 30 },
    };
    onChange({
      ...group,
      conditions: [defaultNewCond, ...group.conditions],
    });
  };

  // Hızlı Şablon Seçildiğinde En Üste Ekle
  const handleSelectTemplate = (templateKey: string) => {
    if (!templateKey) return;

    let newCond: Condition | null = null;

    if (templateKey === 'rsi_level') {
      newCond = {
        left: { type: 'indicator', name: 'RSI', period: 14 },
        operator: isSellGroup ? '>' : '<',
        right: { type: 'value', value: isSellGroup ? 70 : 30 },
      };
    } else if (templateKey === 'ema_cross') {
      newCond = {
        left: { type: 'indicator', name: 'EMA', period: 20 },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: { type: 'indicator', name: 'EMA', period: 50 },
      };
    } else if (templateKey === 'price_ema') {
      newCond = {
        left: { type: 'price', field: 'close' },
        operator: isSellGroup ? '<' : '>',
        right: { type: 'indicator', name: 'EMA', period: 200 },
      };
    } else if (templateKey === 'macd_signal') {
      newCond = {
        left: { type: 'indicator', name: 'MACD', period: 12, field: 'MACD' },
        operator: isSellGroup ? '<' : '>',
        right: { type: 'indicator', name: 'MACD', period: 12, field: 'signal' },
      };
    } else if (templateKey === 'adx_trend') {
      newCond = {
        left: { type: 'indicator', name: 'ADX', period: 14 },
        operator: '>',
        right: { type: 'value', value: 25 },
      };
    }

    if (newCond) {
      onChange({
        ...group,
        conditions: [newCond, ...group.conditions],
      });
    }
  };

  const handleUpdateCondition = (index: number, condition: Condition) => {
    const newConditions = [...group.conditions];
    newConditions[index] = condition;
    onChange({ ...group, conditions: newConditions });
  };

  const handleDeleteCondition = (index: number) => {
    onChange({
      ...group,
      conditions: group.conditions.filter((_, i) => i !== index),
    });
  };

  const handleToggleLogic = () => {
    onChange({
      ...group,
      logic: group.logic === 'AND' ? 'OR' : 'AND',
    });
  };

  return (
    <div className={`border rounded-xl p-4 ${colorMap[accentColor] || colorMap.indigo}`}>
      {/* Başlık ve Butonlar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeMap[accentColor] || badgeMap.indigo}`}>
            {title}
          </span>
          <span className="text-[10px] text-slate-500">
            {group.conditions.length} koşul
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* AND/OR toggle */}
          {group.conditions.length > 1 && (
            <button
              onClick={handleToggleLogic}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                group.logic === 'AND'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30'
                  : 'bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/30'
              }`}
              title="Tıkla: Tüm koşullar mı uymalı, yoksa herhangi biri uyması yeterli mi?"
            >
              {group.logic === 'AND' ? 'Tümü Uymalı (VE)' : 'Biri Uymalı (VEYA)'}
            </button>
          )}

          {/* Hızlı Şablon Listesi Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              defaultValue=""
              onChange={(e) => {
                handleSelectTemplate(e.target.value);
                e.target.value = '';
              }}
              className={`text-xs font-semibold rounded-lg px-2.5 py-1 outline-none cursor-pointer border transition-all ${
                isSellGroup
                  ? 'bg-red-950/40 border-red-500/40 text-red-300 hover:bg-red-900/50'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
              }`}
            >
              <option value="" disabled>
                ⚡ Hızlı Şablon Ekle...
              </option>
              <option value="rsi_level" className="bg-[#0d1321] text-slate-100">
                {isSellGroup ? '📊 RSI > 70 (Aşırı Alım - SAT)' : '📊 RSI < 30 (Aşırı Satım - AL)'}
              </option>
              <option value="ema_cross" className="bg-[#0d1321] text-slate-100">
                {isSellGroup ? '🔀 EMA 20 Aşağı Kesti EMA 50 (Death Cross)' : '🔀 EMA 20 Yukarı Kesti EMA 50 (Golden Cross)'}
              </option>
              <option value="price_ema" className="bg-[#0d1321] text-slate-100">
                {isSellGroup ? '📈 Fiyat < EMA 200 (Düşüş Trendi)' : '📈 Fiyat > EMA 200 (Yükseliş Trendi)'}
              </option>
              <option value="macd_signal" className="bg-[#0d1321] text-slate-100">
                {isSellGroup ? '📉 MACD < Signal (MACD Düşüş)' : '📈 MACD > Signal (MACD Yükseliş)'}
              </option>
              <option value="adx_trend" className="bg-[#0d1321] text-slate-100">
                {'🎯 ADX > 25 (Güçlü Trend Filtresi)'}
              </option>

            </select>
          </div>

          {/* Özel Koşul Ekle (En Üste Ekler) */}
          <button
            onClick={handleAddCondition}
            className="flex items-center gap-1 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            + Özel Koşul
          </button>
        </div>
      </div>

      {/* Koşul listesi */}
      <div className="flex flex-col gap-2">
        {group.conditions.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-900/40 rounded-lg border border-slate-800/40">
            Henüz koşul eklenmedi. Yukarıdaki "⚡ Hızlı Şablon Ekle" veya "+ Özel Koşul" butonuna tıklayarak ilk kuralınızı ekleyin.
          </div>
        ) : (
          group.conditions.map((condition, index) => (
            <div key={index}>
              {index > 0 && (
                <div className="flex items-center justify-center py-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      group.logic === 'AND'
                        ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                        : 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                    }`}
                  >
                    {group.logic === 'AND' ? 'VE (Tüm Koşullar Sağlanmalı)' : 'VEYA (Herhangi Biri Sağlanabilir)'}
                  </span>
                </div>
              )}
              <ConditionRow
                condition={condition}
                onChange={(c) => handleUpdateCondition(index, c)}
                onDelete={() => handleDeleteCondition(index)}
                indicators={indicators}
                index={index}
                isSellGroup={isSellGroup}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}