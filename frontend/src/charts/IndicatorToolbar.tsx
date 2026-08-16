import { Settings2 } from 'lucide-react';
import { useChartSettingsStore, type IndicatorSettingsMap } from '../store/chartSettingsStore';

export interface IndicatorsState {
  ema20: boolean;
  ema50: boolean;
  ema100: boolean;
  ema200: boolean;
  rsi: boolean;
  macd: boolean;
  bb: boolean;
}

export const DEFAULT_INDICATORS_STATE: IndicatorsState = {
  ema20: false,
  ema50: false,
  ema100: false,
  ema200: false,
  rsi: false,
  macd: false,
  bb: false,
};

interface IndicatorToolbarProps {
  state: IndicatorsState;
  onToggle: (key: keyof IndicatorsState) => void;
  onOpenSettings?: (key: keyof IndicatorSettingsMap) => void;
}

const INDICATORS: { key: keyof IndicatorsState; label: string }[] = [
  { key: 'ema20', label: 'EMA 20' },
  { key: 'ema50', label: 'EMA 50' },
  { key: 'ema100', label: 'EMA 100' },
  { key: 'ema200', label: 'EMA 200' },
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
  { key: 'bb', label: 'Bollinger' },
];

export default function IndicatorToolbar({ state, onToggle, onOpenSettings }: IndicatorToolbarProps) {
  const [settings] = useChartSettingsStore();

  /**
   * Rozetin rengi grafikteki ÇİZGİNİN rengidir.
   *
   * Önceden her rozetin rengi burada Tailwind sınıfı olarak sabitti; kullanıcı
   * ayarlardan EMA 50'yi mora çevirince grafikte mor çizgi, araç çubuğunda
   * hâlâ camgöbeği rozet görünüyordu. Rozet artık ayarlardaki renkten
   * türüyor, yani her zaman doğru çizgiyi işaret ediyor.
   *
   * Bu renkler kasten token sisteminin dışında: kategorik bir veri paleti,
   * arayüz vurgusu değil. Kullanıcının seçtiği renk neyse o.
   */
  const seriesColor = (key: keyof IndicatorsState): string | null => {
    const s = settings.indicators as unknown as Record<string, { color?: string } | undefined>;
    return s?.[key]?.color ?? null;
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-overlay/95 p-1.5 shadow-md backdrop-blur-md">
      {INDICATORS.map(({ key, label }) => {
        const isActive = state[key];
        const color = seriesColor(key);

        return (
          <div
            key={key}
            className={`flex select-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ease-out ${
              isActive
                ? 'border-line-strong bg-surface-hover text-content-strong'
                : 'border-transparent text-content-muted hover:bg-surface-hover hover:text-content'
            }`}
          >
            <button
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={isActive}
              className="flex items-center gap-1.5"
            >
              {/* Nokta değil kısa bir çizgi: grafikte çizilen şey bir çizgi.
                  Nabız animasyonu kaldırıldı — açık bir gösterge "bekleyen"
                  bir durum değil, animasyon hiçbir şey anlatmıyordu. */}
              <span
                aria-hidden
                className={`h-0.5 w-3 rounded-full ${isActive ? '' : 'bg-ink-600'}`}
                style={isActive && color ? { backgroundColor: color } : undefined}
              />
              <span>{label}</span>
            </button>

            {isActive && onOpenSettings && (
              <button
                type="button"
                aria-label={`${label} ayarları`}
                title={`${label} ayarları`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(key as keyof IndicatorSettingsMap);
                }}
                className="rounded p-0.5 text-content-faint transition-colors ease-out hover:bg-surface-hover hover:text-content"
              >
                <Settings2 className="h-3 w-3" strokeWidth={1.75} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
