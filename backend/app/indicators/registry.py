"""
İndikatör Registry.

Tüm mevcut indikatörleri merkezi olarak kaydeder.
Rule Engine, indikatör adından (EMA, RSI vb.) doğru hesaplayıcıyı bulur.
"""

from __future__ import annotations

import pandas as pd
import numpy as np


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
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    return 100 - (100 / (1 + rs))


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
    """Average True Range (ATR)."""
    high = df["high"]
    low = df["low"]
    close = df["close"]

    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    return tr.ewm(span=period, adjust=False).mean()


def calc_bollinger(df: pd.DataFrame, period: int) -> dict[str, pd.Series]:
    """Bollinger Bands."""
    sma = df["close"].rolling(window=period).mean()
    std = df["close"].rolling(window=period).std()

    return {
        "BB_upper": sma + (2.0 * std),
        "BB_middle": sma,
        "BB_lower": sma - (2.0 * std),
    }


def calc_adx(df: pd.DataFrame, period: int) -> dict[str, pd.Series]:
    """Average Directional Index (ADX)."""
    high = df["high"]
    low = df["low"]
    close = df["close"]

    plus_dm = high.diff()
    minus_dm = -low.diff()

    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(span=period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)

    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di))
    adx = dx.ewm(span=period, adjust=False).mean()

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
    def get_value(name: str, df: pd.DataFrame, period: int, bar_index: int, field: str | None = None) -> float:
        """
        Belirli bir bar indeksindeki indikatör değerini döndürür.
        """
        if bar_index < 0 or bar_index >= len(df) or bar_index < period:
            return float("nan")

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
