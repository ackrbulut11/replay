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
import { OPERATORS, PRICE_FIELDS, TIMEFRAMES, createEmptyCondition } from '../types/strategy';

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
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
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
              onChange({ type: 'value', value: 0 });
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
                  period: val.startsWith('$') ? val : (parseInt(val) || operand.period),
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
                value: val.startsWith('$') ? val : (parseFloat(val) || 0),
              });
            }}
            placeholder="Sayı (ör: 70)"
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
}

function ConditionRow({ condition, onChange, onDelete, indicators, index }: ConditionRowProps) {
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
          onChange={(left) => onChange({ ...condition, left })}
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

  const handleAddCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createEmptyCondition()],
    });
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
      {/* Başlık */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeMap[accentColor] || badgeMap.indigo}`}>
            {title}
          </span>
          <span className="text-[10px] text-slate-500">
            {group.conditions.length} koşul
          </span>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Koşul ekle */}
          <button
            onClick={handleAddCondition}
            className="flex items-center gap-1 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Koşul Ekle
          </button>
        </div>
      </div>

      {/* Koşul listesi */}
      <div className="flex flex-col gap-2">
        {group.conditions.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-900/40 rounded-lg border border-slate-800/40">
            Henüz koşul eklenmedi. Yukarıdaki "+ Koşul Ekle" butonuna tıklayarak ilk kuralınızı belirleyin.
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
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}