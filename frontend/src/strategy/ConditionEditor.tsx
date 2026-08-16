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
import { OPERATORS, PRICE_FIELDS, TIMEFRAMES, isConditionGroup } from '../types/strategy';

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
        <span className="text-2xs text-content-faint font-medium">{label}</span>
        {/* Hızlı Tip Değiştirici Butonlar */}
        <div className="flex items-center gap-1 bg-canvas p-0.5 rounded-lg border border-line">
          <button
            type="button"
            onClick={() => onChange({ type: 'indicator', name: 'EMA', period: 20 })}
            className={`text-2xs px-1.5 py-0.5 rounded font-medium transition-all ${
              type === 'indicator'
                ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40'
                : 'text-content-faint hover:text-content'
            }`}
            title="İndikatör seç (EMA, RSI, MACD vs.)"
          >
            İndikatör
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: 'value', value: 30 })}
            className={`text-2xs px-1.5 py-0.5 rounded font-medium transition-all ${
              type === 'value'
                ? 'bg-warn-600/30 text-warn-300 border border-warn-500/40'
                : 'text-content-faint hover:text-content'
            }`}
            title="Sabit Sayı / Seviye gir (30, 70, 0 vs.)"
          >
            Sabit Sayı
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: 'price', field: 'close' })}
            className={`text-2xs px-1.5 py-0.5 rounded font-medium transition-all ${
              type === 'price'
                ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40'
                : 'text-content-faint hover:text-content'
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
              onChange({ type: 'value', value: 0 });
            }
          }}
          className="bg-surface-raised border border-line-strong text-content text-xs rounded-lg px-2 py-1.5 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none transition-colors"
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
              className="bg-surface-raised border border-line-strong text-content text-xs rounded-lg px-2 py-1.5 focus:border-accent-500 outline-none transition-colors font-medium"
            >
              {indicators.map((ind) => (
                <option key={ind.name} value={ind.name}>
                  {ind.display_name}
                </option>
              ))}
            </select>
            {/* Periyot kutusu yalnızca periyodu OLAN indikatörlerde.
                Mum formasyonları (yutan mum, doji, çekiç) 1–3 barlıktır;
                kutu duruyorken kullanıcı ona bir sayı yazıyor ve hiçbir
                etkisi olmuyordu. */}
            {indicators.find((i) => i.name === operand.name)?.uses_period !== false && (
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
                className="bg-surface-raised border border-line-strong text-content text-xs rounded-lg px-2 py-1.5 w-24 focus:border-accent-500 outline-none transition-colors font-mono"
                title="İndikatör periyodu (örneğin: 14 veya 20). Gelişmiş kullanıcılar: $param_adı"
              />
            )}
            {/* Çoklu çıktılı indikatörlerde alan seçimi */}
            {indicators.find((i) => i.name === operand.name)?.fields?.length ? (
              <select
                value={operand.field || ''}
                onChange={(e) => onChange({ ...operand, field: e.target.value || undefined })}
                className="bg-surface-raised border border-accent-700/60 text-accent-300 text-xs font-medium rounded-lg px-2 py-1.5 focus:border-accent-500 outline-none transition-colors"
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
              className="bg-surface-raised border border-line-strong text-content-muted text-xs rounded-lg px-2 py-1.5 focus:border-accent-500 outline-none transition-colors"
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
              className="bg-surface-raised border border-line-strong text-content text-xs rounded-lg px-2 py-1.5 focus:border-accent-500 outline-none transition-colors font-medium"
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
              className="bg-surface-raised border border-line-strong text-content-muted text-xs rounded-lg px-2 py-1.5 focus:border-accent-500 outline-none transition-colors"
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
            placeholder="Sayı (ör: 0)"
            className="bg-surface-raised border border-line-strong text-content text-xs rounded-lg px-2 py-1.5 w-28 focus:border-accent-500 outline-none transition-colors font-mono font-medium"
            title="Sabit sayısal değer (örneğin: 0, 30, 70)"
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
  // Solda indikatör seçildiğinde sağ tarafı o indikatörün mantığına göre otomatik ayarla
  const handleLeftChange = (left: Operand) => {
    let newRight = condition.right;
    let newOperator = condition.operator;

    if (left.type === 'indicator') {
      const name = left.name.toUpperCase();
      if (name === 'MACD') {
        newRight = { type: 'value', value: 0 };
        newOperator = isSellGroup ? 'cross_below' : 'cross_above';
      } else if (name === 'RSI') {
        newRight = { type: 'value', value: isSellGroup ? 70 : 30 };
        newOperator = isSellGroup ? 'cross_below' : 'cross_above';
      } else if (name === 'ADX') {
        newRight = { type: 'value', value: 25 };
        newOperator = '>';
      } else if (name === 'ATR') {
        newRight = { type: 'value', value: 2.5 };
        newOperator = '>';
      } else if (name === 'STOCH' || name.includes('STOCH')) {
        newRight = { type: 'value', value: isSellGroup ? 80 : 20 };
        newOperator = isSellGroup ? 'cross_below' : 'cross_above';
      } else if (name === 'EMA' || name === 'SMA') {
        newRight = { type: 'indicator', name: 'EMA', period: 50 };
        newOperator = isSellGroup ? 'cross_below' : 'cross_above';
      } else if (condition.right.type === 'indicator' && name !== 'BOLLINGERBANDS') {
        newRight = { type: 'value', value: 0 };
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
    <div className="group relative flex flex-col gap-3 bg-surface-raised border border-line rounded-xl p-3 hover:border-line-strong transition-colors">
      {/* Satır başlığı */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-content-faint" />
          <span className="text-2xs text-content-faint font-mono font-medium">#{index + 1}</span>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 touch:opacity-100 p-1 text-loss-400/60 hover:text-loss-400 hover:bg-loss-500/10 rounded-lg transition-all"
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
          <span className="text-2xs text-content-faint font-medium">Operatör</span>
          <select
            value={condition.operator}
            onChange={(e) => onChange({ ...condition, operator: e.target.value as OperatorType })}
            className="bg-accent-950/50 border border-accent-700/50 text-accent-300 text-xs rounded-lg px-3 py-1.5 font-medium focus:border-accent-500 outline-none transition-colors"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value} className="bg-surface-raised text-content-strong py-1">
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

// Arayüzde izin verilen azami iç içe grup derinliği. Backend 10 seviyeye
// kadar değerlendirir; ekranda 2 seviyeden fazlası okunamaz hale geliyor.
const MAX_UI_GROUP_DEPTH = 2;

interface ConditionEditorProps {
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  indicators: IndicatorInfo[];
  title: string;
  /**
   * Grubun ne işe yaradığı.
   *
   * Eskiden burada `accentColor` vardı ve `'red'` değeri yalnızca rengi
   * değil DAVRANIŞI da belirliyordu: çıkış grubunda yeni koşulun varsayılan
   * operatörü `cross_below`, RSI eşiği 70 oluyordu. Renk adına bağlı bir
   * davranış, renk değiştirmek istendiği anda sessizce bozulur — prop artık
   * niyeti taşıyor, görünüm ondan türüyor.
   */
  kind?: 'entry' | 'exit';
  /** İç içe grup seviyesi; 0 = en üst. Kendi kendini çağırırken artar. */
  depth?: number;
  /** Alt grup olarak render edilirken üst grup silme düğmesi sağlar. */
  onDeleteGroup?: () => void;
}

export default function ConditionEditor({
  group,
  onChange,
  indicators,
  title,
  kind = 'entry',
  depth = 0,
  onDeleteGroup,
}: ConditionEditorProps) {
  const isSellGroup = kind === 'exit';

  // Yeni eklenen özel koşul her zaman en üste gelir (#1 sıraya)
  const handleAddCondition = () => {
    const defaultNewCond: Condition = {
      left: { type: 'indicator', name: 'RSI', period: 14 },
      operator: isSellGroup ? 'cross_below' : 'cross_above',
      right: { type: 'value', value: isSellGroup ? 70 : 30 },
    };
    onChange({
      ...group,
      conditions: [defaultNewCond, ...group.conditions],
    });
  };

  // Alt grup ekler: "(A VE B) VEYA (C VE D)" ifadesinin UI karşılığı.
  // Üst grup VEYA, alt gruplar VE olacak şekilde başlatılır — en sık kurulan
  // kalıp bu ve kullanıcı mantık düğmesiyle her ikisini de değiştirebilir.
  const handleAddGroup = () => {
    const newGroup: ConditionGroup = {
      logic: 'AND',
      conditions: [
        {
          left: { type: 'indicator', name: 'RSI', period: 14 },
          operator: isSellGroup ? 'cross_below' : 'cross_above',
          right: { type: 'value', value: isSellGroup ? 70 : 30 },
        },
      ],
    };
    onChange({
      ...group,
      logic: group.conditions.length > 0 ? 'OR' : group.logic,
      conditions: [...group.conditions, newGroup],
    });
  };

  // Gerçekçi Trader Şablonları (En Üste Ekler)
  const handleSelectTemplate = (templateKey: string) => {
    if (!templateKey) return;

    let newCond: Condition | null = null;

    if (templateKey === 'macd_zero') {
      // MACD Sıfır Çizgisi Kesişimi (Kullanıcının Talep Ettiği İdeal MACD Kuralı)
      newCond = {
        left: { type: 'indicator', name: 'MACD', period: 12, field: 'MACD' },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: { type: 'value', value: 0 },
      };
    } else if (templateKey === 'macd_signal') {
      // MACD Sinyal Çizgisi Kesişimi
      newCond = {
        left: { type: 'indicator', name: 'MACD', period: 12, field: 'MACD' },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: { type: 'indicator', name: 'MACD', period: 12, field: 'MACD_signal' },
      };
    } else if (templateKey === 'rsi_level') {
      // RSI Aşırı Alım / Satım Seviye Kesişimi
      newCond = {
        left: { type: 'indicator', name: 'RSI', period: 14 },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: { type: 'value', value: isSellGroup ? 70 : 30 },
      };
    } else if (templateKey === 'ema_cross') {
      // EMA Kesişimi (Golden / Death Cross)
      newCond = {
        left: { type: 'indicator', name: 'EMA', period: 20 },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: { type: 'indicator', name: 'EMA', period: 50 },
      };
    } else if (templateKey === 'price_ema') {
      // Fiyat vs EMA Trend Filtresi
      newCond = {
        left: { type: 'price', field: 'close' },
        operator: isSellGroup ? '<' : '>',
        right: { type: 'indicator', name: 'EMA', period: 200 },
      };
    } else if (templateKey === 'bollinger_bounce') {
      // Bollinger Bant Kırılımı / Sıçraması
      newCond = {
        left: { type: 'price', field: 'close' },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: {
          type: 'indicator',
          name: 'BollingerBands',
          period: 20,
          // Alan adları backend registry'sindeki anahtarlarla birebir aynı olmalı;
          // 'upper'/'lower' değerlendirme sırasında "geçersiz alan" hatası veriyordu.
          field: isSellGroup ? 'BB_upper' : 'BB_lower',
        },
      };
    } else if (templateKey === 'stoch_level') {
      // Stochastic Seviye Kesişimi
      newCond = {
        left: { type: 'indicator', name: 'Stochastic', period: 14 },
        operator: isSellGroup ? 'cross_below' : 'cross_above',
        right: { type: 'value', value: isSellGroup ? 80 : 20 },
      };
    } else if (templateKey === 'adx_trend') {
      // ADX Güç Filtresi
      newCond = {
        left: { type: 'indicator', name: 'ADX', period: 14 },
        operator: '>',
        right: { type: 'value', value: 25 },
      };
    } else if (templateKey === 'take_profit') {
      // Kar Al Kuralı (PnL % >= 3.5)
      newCond = {
        left: { type: 'pnl' },
        operator: '>=',
        right: { type: 'value', value: 3.5 },
      };
    } else if (templateKey === 'stop_loss') {
      // Zarar Durdur Kuralı (PnL % <= -2.0)
      newCond = {
        left: { type: 'pnl' },
        operator: '<=',
        right: { type: 'value', value: -2.0 },
      };
    }


    if (newCond) {
      onChange({
        ...group,
        conditions: [newCond, ...group.conditions],
      });
    }
  };

  const handleUpdateCondition = (index: number, condition: Condition | ConditionGroup) => {
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
    /* Üst seviye grup çerçeveli bir bölüm; alt gruplar yalnızca soldan
       girintili ve tek bir dikey çizgiyle işaretli. İç içe kutu yerine
       girinti kullanmak parantez yapısını okunur tutuyor. */
    <section
      className={
        depth === 0
          ? 'rounded-lg border border-line bg-surface'
          : 'border-l border-line-strong pl-3'
      }
    >
      {/* Başlık ve Butonlar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 ${
          depth === 0 ? 'border-b border-line-subtle px-3.5 py-2.5' : 'pb-2'
        }`}
      >
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-medium text-content-strong">{title}</h3>
          <span className="font-mono text-2xs text-content-faint">
            {group.conditions.length} koşul
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* VE/VEYA anahtarı. Mavi/turuncu rozet yerine nötr bir anahtar:
              iki seçenek de eşit derecede geçerli, biri "uyarı" değil. */}
          {group.conditions.length > 1 && (
            <button
              onClick={handleToggleLogic}
              className="rounded-md border border-line-strong px-2 py-1 text-2xs text-content transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover"
              title="Tıkla: tüm koşullar mı sağlanmalı, biri yeterli mi?"
            >
              {group.logic === 'AND' ? 'Tümü sağlanmalı' : 'Biri yeterli'}
            </button>
          )}

          {/* Hazır şablonlar. Emoji ve ok işaretleri kaldırıldı — kural
              zaten metinle yazılı ve emoji her platformda başka çiziliyordu. */}
          <select
            defaultValue=""
            aria-label="Hazır koşul ekle"
            onChange={(e) => {
              handleSelectTemplate(e.target.value);
              e.target.value = '';
            }}
            className="cursor-pointer rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-2xs text-content outline-none transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover"
          >
            <option value="" disabled>
              Hazır koşul ekle
            </option>
            <option value="macd_zero">
              {isSellGroup ? "MACD, 0'ı aşağı kesti" : "MACD, 0'ı yukarı kesti"}
            </option>
            <option value="rsi_level">
              {isSellGroup ? 'RSI 70’i aşağı kesti' : 'RSI 30’u yukarı kesti'}
            </option>
            <option value="ema_cross">
              {isSellGroup ? 'EMA 20, EMA 50’yi aşağı kesti' : 'EMA 20, EMA 50’yi yukarı kesti'}
            </option>
            <option value="macd_signal">
              {isSellGroup ? 'MACD, sinyali aşağı kesti' : 'MACD, sinyali yukarı kesti'}
            </option>
            <option value="price_ema">
              {isSellGroup ? 'Fiyat, EMA 200 altında' : 'Fiyat, EMA 200 üstünde'}
            </option>
            <option value="bollinger_bounce">
              {isSellGroup ? 'Fiyat, Bollinger üst bandında' : 'Fiyat, Bollinger alt bandında'}
            </option>
            <option value="stoch_level">
              {isSellGroup ? 'Stoch %K 80’i aşağı kesti' : 'Stoch %K 20’yi yukarı kesti'}
            </option>
            <option value="adx_trend">ADX 25 üstünde — güçlü trend</option>
          </select>

          <button
            onClick={handleAddCondition}
            className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-2xs text-content transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover"
          >
            <Plus className="h-3 w-3" strokeWidth={2} />
            Özel koşul
          </button>

          {/* Alt grup: (A VE B) VEYA (C VE D) kurmayı mümkün kılar */}
          {depth < MAX_UI_GROUP_DEPTH && (
            <button
              onClick={handleAddGroup}
              title="Parantezli kural: (A VE B) VEYA (C VE D)"
              className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-2xs text-content transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Alt grup
            </button>
          )}

          {onDeleteGroup && (
            <button
              onClick={onDeleteGroup}
              aria-label="Bu alt grubu sil"
              title="Bu alt grubu sil"
              className="rounded p-1 text-content-faint transition-colors ease-out hover:bg-loss-950 hover:text-loss-400"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Koşul listesi */}
      <div className={`flex flex-col gap-2 ${depth === 0 ? 'p-3.5' : ''}`}>
        {group.conditions.length === 0 ? (
          <p className="py-4 text-xs leading-relaxed text-content-faint">
            Henüz koşul yok. “Hazır koşul ekle” en sık kullanılan kalıpları tek
            tıkla getirir; “Özel koşul” boş bir satır açar.
          </p>
        ) : (
          group.conditions.map((condition, index) => (
            <div key={index}>
              {index > 0 && (
                /* Koşullar arası bağlaç: ayraç çizgisinin üstünde küçük bir
                   etiket. Rozet yerine çizgi, satırların bir liste olduğunu
                   gösteriyor. */
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-2xs text-content-faint">
                    {group.logic === 'AND' ? 've' : 'veya'}
                  </span>
                  <span className="h-px flex-1 bg-line-subtle" />
                </div>
              )}
              {isConditionGroup(condition) ? (
                <ConditionEditor
                  group={condition}
                  onChange={(g) => handleUpdateCondition(index, g)}
                  onDeleteGroup={() => handleDeleteCondition(index)}
                  indicators={indicators}
                  title={`Alt grup ${index + 1}`}
                  kind={kind}
                  depth={depth + 1}
                />
              ) : (
                <ConditionRow
                  condition={condition}
                  onChange={(c) => handleUpdateCondition(index, c)}
                  onDelete={() => handleDeleteCondition(index)}
                  indicators={indicators}
                  index={index}
                  isSellGroup={isSellGroup}
                />
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}