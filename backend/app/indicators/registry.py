"""
İndikatör Registry.

Tüm mevcut indikatörleri merkezi olarak kaydeder.
Rule Engine, indikatör adından (EMA, RSI vb.) doğru hesaplayıcıyı bulur.
"""

from __future__ import annotations

import pandas as pd


# ─── Ortak Yardımcılar ────────────────────────────────────────────────────────


def _wilder(series: pd.Series, period: int) -> pd.Series:
    """Wilder yumuşatması (RMA) — RSI, ATR ve ADX'in kullandığı ortalama.

    `alpha = 1/period`. Pandas'ın `ewm(span=period)` biçimi `alpha = 2/(period+1)`
    demektir; ATR(14) için 0,0714 yerine 0,1333, yani yaklaşık iki kat tepkisel
    bir seri üretir. Wilder'ın tanımladığı ATR/ADX bu değildir ve diğer
    platformlarla (TradingView vb.) karşılaştırıldığında görünür şekilde sapar.
    """
    return series.ewm(alpha=1.0 / period, adjust=False).mean()


def _true_range(df: pd.DataFrame) -> pd.Series:
    """Gerçek Aralık (True Range) — ATR ve ADX'in ortak girdisi (RULES.md #8)."""
    high = df["high"]
    low = df["low"]
    prev_close = df["close"].shift()

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)


# ─── İndikatör Hesaplama Fonksiyonları ─────────────────────────────────────────


def calc_ema(df: pd.DataFrame, period: int) -> pd.Series:
    """Üstel Hareketli Ortalama (EMA)."""
    return df["close"].ewm(span=period, adjust=False).mean()


def calc_sma(df: pd.DataFrame, period: int) -> pd.Series:
    """Basit Hareketli Ortalama (SMA)."""
    return df["close"].rolling(window=period).mean()


def calc_rsi(df: pd.DataFrame, period: int) -> pd.Series:
    """Relative Strength Index (RSI) - Wilder's Smoothing."""
    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = _wilder(gain, period)
    avg_loss = _wilder(loss, period)

    # Sıfıra bölmeyi NaN'a çevirip uç durumları aşağıda açıkça ele alıyoruz.
    rs = avg_gain / avg_loss.replace(0.0, float("nan"))
    rsi = 100 - (100 / (1 + rs))

    # Hiç kayıp yoksa RSI tanım gereği 100'dür; NaN bırakılırsa kesintisiz
    # yükselişte RSI koşulları sessizce hiç tetiklenmez.
    no_loss = avg_loss == 0
    rsi = rsi.mask(no_loss & (avg_gain > 0), 100.0)
    # Ne kazanç ne kayıp varsa (tamamen yatay fiyat) nötr kabul edilir.
    rsi = rsi.mask(no_loss & (avg_gain == 0), 50.0)

    return rsi


def calc_macd(df: pd.DataFrame, period: int = 12) -> dict[str, pd.Series]:
    """
    MACD hesaplama.

    Varsayılan: fast=12, slow=26, signal=9.
    period parametresi fast period olarak kullanılır.
    """
    fast = period
    slow = max(fast * 2 + 2, 26)  # fast=12 -> slow=26
    signal_period = 9

    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    histogram = macd_line - signal_line

    return {
        "MACD": macd_line,
        "MACD_signal": signal_line,
        "MACD_hist": histogram,
    }


def calc_atr(df: pd.DataFrame, period: int) -> pd.Series:
    """Average True Range (ATR) — Wilder yumuşatması."""
    return _wilder(_true_range(df), period)


def calc_bollinger(df: pd.DataFrame, period: int) -> dict[str, pd.Series]:
    """Bollinger Bands."""
    sma = df["close"].rolling(window=period).mean()
    std = df["close"].rolling(window=period).std()

    return {
        "BB_upper": sma + (2.0 * std),
        "BB_middle": sma,
        "BB_lower": sma - (2.0 * std),
    }


def calc_stochastic(df: pd.DataFrame, period: int) -> dict[str, pd.Series]:
    """
    Stochastic Osilatör.

    %K = 100 * (kapanış - period içindeki en düşük) / (en yüksek - en düşük)
    %D = %K'nın 3 periyotluk basit ortalaması (sinyal çizgisi)
    """
    low_min = df["low"].rolling(window=period).min()
    high_max = df["high"].rolling(window=period).max()
    price_range = high_max - low_min

    # Sıfıra bölmeyi NaN'a çevirip aşağıda açıkça ele alıyoruz.
    k = 100 * (df["close"] - low_min) / price_range.replace(0.0, float("nan"))
    # Period boyunca yüksek ve düşük eşitse (tamamen yatay) oran tanımsızdır; nötr 50.
    k = k.mask(price_range == 0, 50.0)
    d = k.rolling(window=3).mean()

    return {"STOCH_K": k, "STOCH_D": d}


def calc_adx(df: pd.DataFrame, period: int) -> dict[str, pd.Series]:
    """Average Directional Index (ADX) — Wilder yumuşatması."""
    high = df["high"]
    low = df["low"]

    up_move = high.diff()
    down_move = -low.diff()

    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)

    atr = _wilder(_true_range(df), period)
    # Tamamen hareketsiz seride ATR = 0 ve bölme tanımsız kalır. Böyle bir
    # seride hareket de yön de yoktur: DI sıfırdır (NaN değil), aksi halde
    # yatay bir sembolde ADX koşulları sessizce hiç değerlendirilemezdi.
    safe_atr = atr.replace(0.0, float("nan"))
    plus_di = (100 * (_wilder(plus_dm, period) / safe_atr)).mask(atr == 0, 0.0)
    minus_di = (100 * (_wilder(minus_dm, period) / safe_atr)).mask(atr == 0, 0.0)

    di_sum = (plus_di + minus_di).replace(0.0, float("nan"))
    dx = 100 * ((plus_di - minus_di).abs() / di_sum)
    # +DI ve -DI'nın ikisi de sıfırsa yön yoktur; DX tanımsız değil, sıfırdır.
    dx = dx.mask((plus_di == 0) & (minus_di == 0), 0.0)
    adx = _wilder(dx, period)

    return {
        "ADX": adx,
        "+DI": plus_di,
        "-DI": minus_di,
    }


def calc_volume_ma(df: pd.DataFrame, period: int) -> pd.Series:
    """Volume Moving Average."""
    return df["volume"].rolling(window=period).mean()


# ─── İndikatör Tanım Bilgileri ────────────────────────────────────────────────


INDICATOR_INFO = {
    "EMA": {
        "display_name": "Exponential Moving Average",
        "category": "trend",
        "default_period": 20,
        "min_period": 2,
        "max_period": 500,
        "fields": [],
        "calc": calc_ema,
        "multi_output": False,
    },
    "SMA": {
        "display_name": "Simple Moving Average",
        "category": "trend",
        "default_period": 20,
        "min_period": 2,
        "max_period": 500,
        "fields": [],
        "calc": calc_sma,
        "multi_output": False,
    },
    "RSI": {
        "display_name": "Relative Strength Index",
        "category": "momentum",
        "default_period": 14,
        "min_period": 2,
        "max_period": 100,
        "fields": [],
        "calc": calc_rsi,
        "multi_output": False,
    },
    "MACD": {
        "display_name": "MACD",
        "category": "momentum",
        "default_period": 12,
        "min_period": 2,
        "max_period": 100,
        "fields": ["MACD", "MACD_signal", "MACD_hist"],
        "calc": calc_macd,
        "multi_output": True,
    },
    "ATR": {
        "display_name": "Average True Range",
        "category": "volatility",
        "default_period": 14,
        "min_period": 2,
        "max_period": 100,
        "fields": [],
        "calc": calc_atr,
        "multi_output": False,
    },
    "BollingerBands": {
        "display_name": "Bollinger Bands",
        "category": "volatility",
        "default_period": 20,
        "min_period": 2,
        "max_period": 200,
        "fields": ["BB_upper", "BB_middle", "BB_lower"],
        "calc": calc_bollinger,
        "multi_output": True,
    },
    "Stochastic": {
        "display_name": "Stochastic Oscillator",
        "category": "momentum",
        "default_period": 14,
        "min_period": 2,
        "max_period": 100,
        "fields": ["STOCH_K", "STOCH_D"],
        "calc": calc_stochastic,
        "multi_output": True,
    },
    "ADX": {
        "display_name": "Average Directional Index",
        "category": "trend",
        "default_period": 14,
        "min_period": 2,
        "max_period": 100,
        "fields": ["ADX", "+DI", "-DI"],
        "calc": calc_adx,
        "multi_output": True,
    },
    "VolumeMA": {
        "display_name": "Volume Moving Average",
        "category": "volatility",
        "default_period": 20,
        "min_period": 2,
        "max_period": 200,
        "fields": [],
        "calc": calc_volume_ma,
        "multi_output": False,
    },
}


class IndicatorRegistry:
    """
    İndikatör merkezi kayıt sistemi.

    Rule Engine, indikatör adından doğru hesaplayıcıyı bulur.
    """

    @staticmethod
    def get_info(name: str) -> dict:
        """İndikatör bilgisini döndürür."""
        info = INDICATOR_INFO.get(name)
        if info is None:
            raise ValueError(
                f"Bilinmeyen indikatör: {name}. "
                f"Desteklenen: {list(INDICATOR_INFO.keys())}"
            )
        return info

    @staticmethod
    def calculate(name: str, df: pd.DataFrame, period: int) -> pd.Series | dict[str, pd.Series]:
        """
        İndikatörü hesaplar.

        Tek çıktılı indikatörler pd.Series, çoklu çıktılılar dict döndürür.
        """
        info = IndicatorRegistry.get_info(name)
        return info["calc"](df, period)

    @staticmethod
    def get_value(
        name: str,
        df: pd.DataFrame,
        period: int,
        bar_index: int,
        field: str | None = None,
        cache: dict | None = None,
    ) -> float:
        """
        Belirli bir bar indeksindeki indikatör değerini döndürür.

        `cache` verilirse (aynı df üzerinde bar-bar döngü yapan
        `RuleEngine.evaluate_range` gibi çağrılarda), aynı (df, name, period)
        kombinasyonu için indikatör serisi yalnızca bir kez hesaplanır ve
        tekrar kullanılır — aksi halde her bar için tüm seri baştan
        hesaplanır (O(n) yerine O(n^2)).
        """
        if bar_index < 0 or bar_index >= len(df) or bar_index < period:
            return float("nan")

        if cache is not None:
            cache_key = (id(df), name, period)
            result = cache.get(cache_key)
            if result is None:
                result = IndicatorRegistry.calculate(name, df, period)
                cache[cache_key] = result
        else:
            result = IndicatorRegistry.calculate(name, df, period)

        if isinstance(result, dict):
            # Çoklu çıktılı indikatör
            if field is None:
                # Varsayılan alan: ilk alan
                info = IndicatorRegistry.get_info(name)
                field = info["fields"][0] if info["fields"] else name
            series = result.get(field)
            if series is None:
                raise ValueError(
                    f"İndikatör {name} için geçersiz alan: {field}. "
                    f"Mevcut alanlar: {list(result.keys())}"
                )
            val = series.iloc[bar_index]
        else:
            val = result.iloc[bar_index]

        return float(val) if not pd.isna(val) else float("nan")

    @staticmethod
    def list_indicators() -> list[dict]:
        """Tüm kullanılabilir indikatörlerin bilgisini döndürür (API için)."""
        result = []
        for name, info in INDICATOR_INFO.items():
            result.append(
                {
                    "name": name,
                    "display_name": info["display_name"],
                    "category": info["category"],
                    "default_period": info["default_period"],
                    "min_period": info["min_period"],
                    "max_period": info["max_period"],
                    "fields": info["fields"],
                }
            )
        return result
