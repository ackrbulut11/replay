"""
Örüntü arama motoru — bir koşulun geçmişte doğru olduğu bar aralıklarını bulur.

Strateji testinden farkı POZİSYON YOKLUĞUdur. `RuleEngine.evaluate_range` bir
durum makinesidir: giriş kuralı pozisyon açar, çıkış kuralı kapatır, aradan
kâr/zarar çıkar. Burada giriş/çıkış ayrımı, pozisyon ve PnL yoktur; tek soru
"bu koşul hangi barlarda doğruydu?".

Bu, kural kurmadan ÖNCEKİ aşamayı karşılar: bir fikri stratejiye çevirmeden
"bu durum 3 yılda kaç kez oldu, nerede kümelendi?" diye bakmak. Aynı soruyu
bugün sormak için uydurma bir çıkış kuralı yazmak ve sinyal listesini okumak
gerekiyordu — o zaman da okunan şey koşul değil, uydurulan çıkışın performansı
oluyordu.

Lookahead: değerlendirme `RuleEvaluator.evaluate_group` üzerinden bar-index
sınırlı yapılır ve warmup barları atlanır — strateji motoruyla birebir aynı yol
(RULES.md §19–23).
"""

from __future__ import annotations

from typing import Union

import pandas as pd

from app.rules.engine import RuleEngine
from app.rules.evaluator import RuleEvaluator

# Tek bir aramadan dönebilecek en fazla bölge. Sınır, "her bar eşleşiyor" gibi
# çok geniş bir koşulun (ör. `close > 0`) yanıtı ve arayüzü boğmasını önler;
# sayım yine de tam döner, kırpılan yalnızca listedir.
DEFAULT_MAX_REGIONS = 500


def _bar_time(df: pd.DataFrame, bar_index: int) -> int:
    """Barın unix saniyesi. Zaman sütunu okuma mantığı tek yerde kalsın diye
    `RuleEngine._bar_timestamp` yeniden kullanılır."""
    return RuleEngine._bar_timestamp(df, bar_index)


def search(
    df: pd.DataFrame,
    condition_group: dict,
    params: dict[str, Union[int, float]] | None = None,
    multi_tf_data: dict[str, pd.DataFrame] | None = None,
    start_index: int | None = None,
    end_index: int | None = None,
    max_regions: int = DEFAULT_MAX_REGIONS,
) -> dict:
    """
    `condition_group`'un doğru olduğu bitişik bar aralıklarını döndürür.

    Args:
        df: OHLCV çerçevesi.
        condition_group: `{logic, conditions}` — strateji kuralıyla aynı DSL.
        params: `$param` referanslarını çözmek için strateji parametreleri.
        multi_tf_data: Farklı zaman dilimi operandları için ek çerçeveler.
        start_index: Taramanın başlayacağı bar; verilmezse warmup'tan sonrası.
        end_index: Taramanın biteceği bar (dahil); verilmezse son bar.
        max_regions: Listede döndürülecek en fazla bölge.

    Returns:
        `total_bars_scanned`, `match_count` (eşleşen BAR sayısı),
        `region_count` (bitişik BÖLGE sayısı), `regions` ve `truncated`.

    `match_count` ile `region_count` bilinçli olarak ayrıdır: "fiyat EMA200
    üstünde" koşulu 800 bar eşleşip 6 bölge oluşturabilir — kullanıcının
    aradığı sayı genelde ikincisidir, ama ilki de aralığın ne kadarını
    kapladığını söyler.

    **Tarama en erken 1. bardan başlar.** Warmup hesabı strateji motoruyla
    ortaktır ve orada 1 bar taban vardır: `cross_above`, `rising`, `falling`
    gibi operatörler bir ÖNCEKİ bara bakıyor, 0. barda o bar yok. Koşulda
    böyle bir operatör olmasa bile taban korunuyor — warmup tanımını iki
    yerde ayrı tutmak, ikisinin zamanla ayrışması demekti. Pratik maliyeti
    yüklenen aralığın ilk barıdır.
    """
    params = params or {}

    if df is None or len(df) == 0:
        return {
            "total_bars_scanned": 0,
            "match_count": 0,
            "region_count": 0,
            "regions": [],
            "truncated": False,
        }

    # Warmup, strateji motorundaki hesabın aynısı: koşul ağacındaki en büyük
    # indikatör ısınma gereksinimi. `entry_rules` anahtarıyla sarmalanıyor
    # çünkü o fonksiyon strateji sözlüğü bekliyor — mantığı kopyalamak yerine
    # yeniden kullanmak, ikisinin zamanla ayrışmasını önler.
    warmup = RuleEngine._get_warmup_period({"entry_rules": condition_group}, params)

    first = warmup if start_index is None else max(int(start_index), warmup)
    last = len(df) - 1 if end_index is None else min(int(end_index), len(df) - 1)
    first = max(first, 0)

    regions: list[dict] = []
    match_count = 0
    # Bölge sayacı listeden AYRI tutulur: liste `max_regions`'ta kırpılırken
    # sayım tam kalmalı, yoksa "500 bölge bulundu" yazıp gerçekte 3000 olduğunu
    # gizlerdik.
    region_count = 0

    # Açık bölgenin başlangıcı — koşul False'a döndüğünde kapatılır.
    open_start: int | None = None
    open_conditions: list[str] = []
    # Aynı df üzerinde bar-bar dönüldüğü için indikatör serileri bir kez
    # hesaplanıp paylaşılır (bkz. IndicatorRegistry.get_value cache).
    cache: dict = {}

    def close_region(end_i: int) -> None:
        nonlocal open_start, region_count
        if open_start is None:
            return
        region_count += 1
        if len(regions) < max_regions:
            regions.append(
                {
                    "start_index": open_start,
                    "end_index": end_i,
                    "start_time": _bar_time(df, open_start),
                    "end_time": _bar_time(df, end_i),
                    "bar_count": end_i - open_start + 1,
                    "conditions_met": open_conditions,
                }
            )
        open_start = None

    scanned = 0
    for i in range(first, last + 1):
        scanned += 1
        matched, conditions_met = RuleEvaluator.evaluate_group(
            condition_group,
            df,
            i,
            params,
            multi_tf_data=multi_tf_data,
            cache=cache,
        )

        if matched:
            match_count += 1
            if open_start is None:
                open_start = i
                open_conditions = conditions_met
        else:
            close_region(i - 1)

    # Tarama koşul doğruyken bittiyse son bölge hâlâ açıktır.
    close_region(last)

    return {
        "total_bars_scanned": scanned,
        "match_count": match_count,
        "region_count": region_count,
        "regions": regions,
        "truncated": region_count > len(regions),
    }
