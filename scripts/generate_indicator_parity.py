"""
Gösterge uyum altın örneğini (`backend/tests/indicator_parity.json`) üretir.

**Neden var:** göstergeler iki yerde hesaplanıyor — backend
`indicators/registry.py` (strateji motorunun gördüğü) ve frontend
`src/utils/indicators.ts` (kullanıcının grafikte gördüğü). İkisi farklı
formüller kullandığı sürece kullanıcı grafikte kesişim görüp backtest'te
görmüyordu; Bollinger'da fark hiç kapanmıyordu bile.

Altın örnek bu ikisini birbirine bağlar: aynı fiyat serisi + backend'in ürettiği
referans değerler. `test_indicator_parity.py` backend'in hâlâ bu değerleri
ürettiğini, `frontend/e2e/indicator-parity.spec.ts` ise frontend'in aynı
değerleri ürettiğini doğrular. Biri kayarsa test kırılır.

Çalıştırma (backend/ dizininden, venv etkinken):
    python ../scripts/generate_indicator_parity.py

Dosya YALNIZCA backend hesabı bilerek değiştiğinde yeniden üretilir; o durumda
frontend'in de aynı şekilde güncellenmesi gerekir (testin amacı bunu zorlamak).
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
import pandas as pd

# `backend/` dizinini import yoluna ekle: script repo kökündeki scripts/ altında.
_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, os.path.abspath(_BACKEND_DIR))

from app.indicators.registry import IndicatorRegistry  # noqa: E402

# Tohum sabit: örnek her çalıştırmada aynı olmalı, aksi halde "test kırıldı mı
# yoksa veri mi değişti" ayırt edilemez.
RANDOM_SEED = 20240819
BAR_COUNT = 300

OUTPUT_PATH = os.path.join(_BACKEND_DIR, "tests", "indicator_parity.json")


def build_frame() -> pd.DataFrame:
    """Deterministik, gerçekçi bir fiyat serisi."""
    rng = np.random.default_rng(RANDOM_SEED)
    close = np.round(100 + np.cumsum(rng.normal(0, 1.2, BAR_COUNT)), 4)
    return pd.DataFrame(
        {
            "close": close,
            "high": np.round(close * 1.004, 4),
            "low": np.round(close * 0.996, 4),
            "open": close,
            "volume": np.ones(BAR_COUNT),
        }
    )


def series(df: pd.DataFrame, name: str, period: int, field: str | None = None) -> list:
    """Bir göstergenin bar bar değeri; ısınma bölgesinde None (backend'de NaN)."""
    values = []
    for i in range(len(df)):
        value = IndicatorRegistry.get_value(name, df, period, i, field)
        values.append(None if math.isnan(value) else round(float(value), 10))
    return values


def main() -> None:
    df = build_frame()
    fixture = {
        "_aciklama": (
            "Gosterge uyum altin ornegi. Backend (indicators/registry.py) ve "
            "frontend (src/utils/indicators.ts) ayni seride ayni sayilari "
            "uretmek ZORUNDA. Iki taraf da bu dosyaya karsi test edilir. "
            "Yeniden uretmek icin: scripts/generate_indicator_parity.py"
        ),
        "close": [float(c) for c in df["close"]],
        "indicators": {
            "EMA20": series(df, "EMA", 20),
            "EMA50": series(df, "EMA", 50),
            "RSI14": series(df, "RSI", 14),
            "BB20_upper": series(df, "BollingerBands", 20, "BB_upper"),
            "BB20_middle": series(df, "BollingerBands", 20, "BB_middle"),
            "BB20_lower": series(df, "BollingerBands", 20, "BB_lower"),
            "MACD12_line": series(df, "MACD", 12, "MACD"),
            "MACD12_signal": series(df, "MACD", 12, "MACD_signal"),
            "MACD12_hist": series(df, "MACD", 12, "MACD_hist"),
        },
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(fixture, fh, ensure_ascii=False, indent=1)
    print(f"Altin ornek yazildi: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
