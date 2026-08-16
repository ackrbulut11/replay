"""
Mum formasyonları.

Her formasyon 1–3 barın OHLC'sinden çıkan **deterministik** bir formüldür —
"neyin yutan mum sayıldığı" burada tek bir yerde, okunabilir biçimde yazılıdır.
Bu, grafik formasyonlarından (OBO, üçgen) bilinçli olarak ayrı tutulmuştur:
onların nesnel tanımı yoktur ve tolerans ayarına göre cevap değişir
(bkz. roadmap.md Faz 3.5).

Dönüş tipi diğer indikatörlerle aynı: `pd.Series`. Değer **1.0 = formasyon var**,
**0.0 = yok**. Bu sayede kural DSL'inde ek bir operatör gerekmez —
`YUTAN_BOGA > 0` yazmak yeterlidir ve formasyonlar aramada olduğu kadar
strateji kurallarının içinde de kullanılabilir ("yutan boğa VE RSI < 30").

Lookahead: her formasyon yalnızca kendi barına ve GERİDEKİ barlara bakar
(`shift(+n)`). `shift(-n)` bu dosyada asla kullanılmaz (RULES.md §19–23).
"""

from __future__ import annotations

import pandas as pd


# Bir mumun gövdesinin, aralığının kaçta kaçından küçükse "doji" sayılacağı.
# Klasik tanım %5–10 arası; ortası alındı.
DOJI_BODY_RATIO = 0.08

# Çekiç/kayan yıldızda uzun fitilin gövdeye oranı — en yaygın kabul 2:1.
LONG_WICK_BODY_RATIO = 2.0

# Aynı formasyonlarda kısa fitilin, tüm aralığa oranla üst sınırı.
SHORT_WICK_RANGE_RATIO = 0.1


def _body(df: pd.DataFrame) -> pd.Series:
    """Gövde büyüklüğü (yönsüz)."""
    return (df["close"] - df["open"]).abs()


def _range(df: pd.DataFrame) -> pd.Series:
    """Mumun tüm aralığı. Sıfıra bölmeyi önlemek için 0 asla döndürülmez.

    Tamamen yatay bir bar (high == low, ör. işlem görmemiş seans) gerçek veride
    oluyor; NaN üretmek yerine oranları 0'a götüren küçük bir taban kullanılır.
    """
    rng = df["high"] - df["low"]
    return rng.where(rng > 0, other=pd.NA).astype(float)


def _upper_wick(df: pd.DataFrame) -> pd.Series:
    return df["high"] - df[["open", "close"]].max(axis=1)


def _lower_wick(df: pd.DataFrame) -> pd.Series:
    return df[["open", "close"]].min(axis=1) - df["low"]


def _as_signal(mask: pd.Series, index: pd.Index) -> pd.Series:
    """Boolean maskeyi 1.0/0.0 serisine çevirir.

    NaN'lar (yeterli geçmişi olmayan ilk barlar, sıfır aralıklı barlar) 0.0
    olur: "formasyon yok" demek doğru cevap — indikatör warmup'ı gibi NaN
    bırakmak, `> 0` karşılaştırmasını sessizce False yapardı zaten, ama
    açıkça 0 yazmak seriyi okunur kılıyor.
    """
    return mask.fillna(False).astype(float).reindex(index).fillna(0.0)


def calc_bullish_engulfing(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Yutan boğa: düşen bir mumun ardından onun gövdesini tamamen saran yükselen mum.

    `period` kullanılmaz (formasyon iki barlıktır) — registry imzası ortak
    olduğu için parametre yine de kabul edilir.
    """
    prev_open = df["open"].shift(1)
    prev_close = df["close"].shift(1)

    prev_bearish = prev_close < prev_open
    curr_bullish = df["close"] > df["open"]
    # Gövde sarması: bugünkü gövde, dünkü gövdeyi iki uçtan da aşmalı.
    engulfs = (df["open"] <= prev_close) & (df["close"] >= prev_open)
    # Dünkü gövde sıfırsa (doji) "sarma" anlamsızlaşır; formasyon sayılmaz.
    prev_has_body = (prev_open - prev_close).abs() > 0

    return _as_signal(prev_bearish & curr_bullish & engulfs & prev_has_body, df.index)


def calc_bearish_engulfing(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Yutan ayı: yükselen bir mumun ardından onun gövdesini tamamen saran düşen mum."""
    prev_open = df["open"].shift(1)
    prev_close = df["close"].shift(1)

    prev_bullish = prev_close > prev_open
    curr_bearish = df["close"] < df["open"]
    engulfs = (df["open"] >= prev_close) & (df["close"] <= prev_open)
    prev_has_body = (prev_open - prev_close).abs() > 0

    return _as_signal(prev_bullish & curr_bearish & engulfs & prev_has_body, df.index)


def calc_hammer(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Çekiç: küçük gövde yukarıda, gövdenin en az iki katı alt fitil, üst fitil yok denecek kadar kısa.

    Bilinçli olarak trend bağlamı ARANMAZ. "Düşüş trendinden sonra gelirse
    çekiç, yükselişten sonra gelirse asılı adam" ayrımı trendin nasıl
    tanımlandığına bağlıdır ve bu dosyanın deterministik olma sözünü bozar.
    Bağlam isteyen kullanıcı kuralına kendisi ekler: `ÇEKİÇ > 0 VE close < EMA50`.
    """
    body = _body(df)
    rng = _range(df)

    long_lower = _lower_wick(df) >= LONG_WICK_BODY_RATIO * body
    short_upper = _upper_wick(df) <= SHORT_WICK_RANGE_RATIO * rng
    # Gövdesiz mum çekiç değil doji; oran testi 0 gövdede anlamsız olurdu.
    has_body = body > 0

    return _as_signal(long_lower & short_upper & has_body, df.index)


def calc_shooting_star(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Kayan yıldız: çekicin dikey aynası — küçük gövde aşağıda, uzun üst fitil."""
    body = _body(df)
    rng = _range(df)

    long_upper = _upper_wick(df) >= LONG_WICK_BODY_RATIO * body
    short_lower = _lower_wick(df) <= SHORT_WICK_RANGE_RATIO * rng
    has_body = body > 0

    return _as_signal(long_upper & short_lower & has_body, df.index)


def calc_doji(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Doji: açılış ile kapanış neredeyse aynı — kararsızlık.

    Mutlak eşik yerine ORAN kullanılır: 60.000 dolarlık bir barda 20 dolarlık
    gövde doji'dir, 2 dolarlık bir hissede değildir.
    """
    return _as_signal(_body(df) <= DOJI_BODY_RATIO * _range(df), df.index)


def calc_morning_star(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Sabah yıldızı (3 bar): güçlü düşüş → küçük gövdeli kararsızlık → güçlü yükseliş.

    Üçüncü mumun ilk mumun gövdesinin yarısından fazlasını geri alması aranır;
    bu, klasik tanımdaki "dönüş teyidi" şartıdır.
    """
    o1, c1 = df["open"].shift(2), df["close"].shift(2)
    o2, c2 = df["open"].shift(1), df["close"].shift(1)

    first_bearish = c1 < o1
    # Ortadaki mum küçük gövdeli: ilk mumun gövdesinin yarısından küçük.
    small_middle = (c2 - o2).abs() < (o1 - c1).abs() * 0.5
    third_bullish = df["close"] > df["open"]
    recovers_half = df["close"] > (o1 + c1) / 2

    return _as_signal(first_bearish & small_middle & third_bullish & recovers_half, df.index)


def calc_evening_star(df: pd.DataFrame, period: int = 1) -> pd.Series:
    """Akşam yıldızı (3 bar): sabah yıldızının aynası — güçlü yükseliş → kararsızlık → güçlü düşüş."""
    o1, c1 = df["open"].shift(2), df["close"].shift(2)
    o2, c2 = df["open"].shift(1), df["close"].shift(1)

    first_bullish = c1 > o1
    small_middle = (c2 - o2).abs() < (c1 - o1).abs() * 0.5
    third_bearish = df["close"] < df["open"]
    gives_back_half = df["close"] < (o1 + c1) / 2

    return _as_signal(first_bullish & small_middle & third_bearish & gives_back_half, df.index)
