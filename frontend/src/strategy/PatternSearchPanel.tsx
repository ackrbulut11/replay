/**
 * PatternSearchPanel — bir koşulun geçmişte doğru olduğu aralıkları listeler.
 *
 * Strateji testinden ayrı durur ve bilinçli olarak kâr/zarar göstermez: burada
 * pozisyon yok, çıkış kuralı yok. Cevapladığı soru "bu kural para kazandırır
 * mı?" değil, ondan önce gelen soru — **"bu durum kaç kez oldu, nerede?"**
 *
 * Bu yüzden panelde yeşil/kırmızı da yok (bkz. DESIGN.md): o iki renk bu üründe
 * kâr ve zarar demek, bir eşleşme sayısı ikisi de değil.
 */

import { useState } from 'react';
import { Search, Loader2, CornerDownRight, AlertTriangle } from 'lucide-react';
import { patternApi } from '../services/patternApi';
import type {
  ConditionGroup,
  StrategyParameter,
  PatternRegion,
  PatternSearchResponse,
} from '../types/strategy';

interface PatternSearchPanelProps {
  /** Aranacak koşul ağacı — genelde stratejinin giriş kuralları. */
  group: ConditionGroup;
  parameters?: StrategyParameter[];
  symbol: string;
  provider: string;
  timeframe: string;
  /** Bir eşleşmeye tıklanınca: grafiği o sembole al ve replay imlecini oraya taşı. */
  onJumpToRegion?: (region: PatternRegion) => void;
}

/** Aramada taranacak mum sayısı seçenekleri. */
const SCAN_RANGES = [
  { value: 2000, label: 'Son 2000 mum' },
  { value: 5000, label: 'Son 5000 mum' },
  { value: 20000, label: 'Son 20000 mum' },
];

/**
 * Sunucu hatasını okunur tek satıra çevirir.
 *
 * Doğrulama hataları (422) bir LİSTE olarak dönüyor ve `apiRequest` onu
 * `JSON.stringify` ile mesaja gömüyor — kullanıcıya ham `["...","..."]`
 * göstermek yerine maddeleri ayırıp yazıyoruz.
 */
function readableError(err: unknown): string {
  const message = (err as { message?: string })?.message;
  if (!message) return 'Arama başarısız.';

  if (message.startsWith('[')) {
    try {
      const parsed = JSON.parse(message);
      if (Array.isArray(parsed)) return parsed.join(' · ');
    } catch {
      // Liste değilmiş; ham mesajı göster.
    }
  }
  return message;
}

function formatDate(unixSeconds: number): string {
  // UTC: grafiğin zaman ekseni de UTC yazıyor (bkz. App.tsx formatBarTime);
  // yerel saatle biçimlendirmek listeyi grafikteki mumdan saatlerce kaydırırdı.
  return new Date(unixSeconds * 1000).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function PatternSearchPanel({
  group,
  parameters,
  symbol,
  provider,
  timeframe,
  onJumpToRegion,
}: PatternSearchPanelProps) {
  const [result, setResult] = useState<PatternSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitBars, setLimitBars] = useState<number>(2000);

  const conditionCount = group?.conditions?.length ?? 0;

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    try {
      const response = await patternApi.searchPatterns({
        provider,
        symbol,
        timeframe,
        condition_group: group,
        parameters,
        limit_bars: limitBars,
      });
      setResult(response);
    } catch (err: unknown) {
      setError(readableError(err));
      setResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-subtle px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 className="text-xs font-medium text-content-strong">Bu koşulu geçmişte ara</h3>
          <p className="mt-0.5 text-2xs text-content-faint">
            Pozisyon açmadan, yalnızca koşulun doğru olduğu aralıklar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xs text-content-muted">
            {symbol} · {timeframe}
          </span>

          <select
            value={limitBars}
            onChange={(e) => setLimitBars(parseInt(e.target.value, 10))}
            aria-label="Taranacak mum sayısı"
            className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-xs text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
          >
            {SCAN_RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching || conditionCount === 0}
            title={conditionCount === 0 ? 'Önce en az bir koşul ekleyin' : undefined}
            className="flex items-center gap-1.5 rounded-md bg-accent-400 px-3 py-1.5 text-xs font-medium text-ink-950 transition-colors ease-out hover:bg-accent-300 disabled:cursor-not-allowed disabled:bg-ink-650 disabled:text-content-disabled"
          >
            {isSearching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {isSearching ? 'Aranıyor…' : 'Ara'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-3.5 py-2.5 text-xs text-loss-300">
          {error}
        </p>
      )}

      {conditionCount === 0 && !error && (
        <p className="px-3.5 py-3 text-xs leading-relaxed text-content-muted">
          Yukarıya en az bir koşul ekleyin. Örneğin “Yutan Boğa &gt; 0” ya da
          “RSI &lt; 30”; arama o koşulun geçmişte hangi mumlarda doğru olduğunu
          gösterir.
        </p>
      )}

      {result && (
        <>
          {/* Özet. `match_count` (kaç bar) ile `region_count` (kaç ayrı olay)
              ayrı gösteriliyor: "fiyat EMA200 üstünde" 800 bar sürüp 6 kez
              olabilir — kullanıcının aradığı sayı genelde ikincisi. */}
          <dl className="grid grid-cols-3 border-b border-line-subtle">
            {[
              ['Bulunan olay', String(result.region_count)],
              ['Eşleşen mum', String(result.match_count)],
              ['Taranan mum', String(result.total_bars_scanned)],
            ].map(([label, value]) => (
              <div key={label} className="border-r border-line-subtle px-3.5 py-2 last:border-r-0">
                <dt className="text-2xs text-content-faint">{label}</dt>
                <dd className="mt-1 font-mono text-sm text-content-strong">{value}</dd>
              </div>
            ))}
          </dl>

          {result.region_count === 0 ? (
            <p className="px-3.5 py-3 text-xs leading-relaxed text-content-muted">
              Bu koşul taranan aralıkta hiç oluşmamış. Koşulu gevşetmeyi ya da
              tarama aralığını genişletmeyi deneyin.
            </p>
          ) : (
            <>
              {result.truncated && (
                <p className="flex items-start gap-2 border-b border-line-subtle px-3.5 py-2 text-2xs text-warn-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} />
                  {result.region_count} olaydan ilk {result.regions.length} tanesi
                  listeleniyor. Daha az sonuç için koşulu daraltın.
                </p>
              )}

              <ul className="custom-scrollbar max-h-64 overflow-y-auto">
                {result.regions.map((region) => (
                  <li key={`${region.start_index}-${region.end_index}`}>
                    <button
                      type="button"
                      onClick={() => onJumpToRegion?.(region)}
                      disabled={!onJumpToRegion}
                      title={
                        onJumpToRegion
                          ? 'Replay’i buraya taşı — sonrasını görmeden karar verin'
                          : undefined
                      }
                      className="flex w-full items-center justify-between gap-3 border-b border-line-subtle px-3.5 py-2 text-left transition-colors ease-out hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {onJumpToRegion && (
                          <CornerDownRight
                            className="h-3 w-3 shrink-0 text-content-faint"
                            strokeWidth={1.75}
                          />
                        )}
                        <span className="truncate font-mono text-xs text-content">
                          {formatDate(region.start_time)}
                          {region.bar_count > 1 && ` → ${formatDate(region.end_time)}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-2xs text-content-faint">
                        {region.bar_count} mum
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
