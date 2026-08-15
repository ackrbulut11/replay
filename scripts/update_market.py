"""
Gece yarısı toplu piyasa verisi güncelleme betiği.

Mevcut kataloğdaki (`app.data.symbols.get_symbols`) tüm sembolleri, tüm
kayıtlı sağlayıcılar (`DataLoader.providers`) için tarar ve `DataLoader.load_data`
üzerinden eksik/yeni barları çekip parquet önbelleğine yazar. `DataLoader` zaten
sadece eksik aralığı çektiği için ilk çalıştırma tam backfill, sonraki
çalıştırmalar artımlı olur. Retention (eski veri temizliği) `DataLoader`
içinde `_prune_to_retention` ile ayrıca uygulanır, burada tekrarlanmaz.

Kullanım (repo kökünden):

    python scripts/update_market.py
    python scripts/update_market.py --provider bist --timeframe 1d
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timedelta

# Uygulama modüllerini kolayca içe aktarabilmek için proje kök dizinini ve backend klasörünü sys.path'e ekle
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_CURRENT_DIR)
sys.path.insert(0, _PROJECT_ROOT)
sys.path.insert(0, os.path.join(_PROJECT_ROOT, "backend"))

from app.data.loader import DataLoader
from app.data.symbols import get_symbols
from app.utils.time import utc_now

DEFAULT_PROVIDERS = ["binance", "nasdaq", "bist", "forex"]
# 4h çekilmez; DataLoader mevcut 1h verisinden isteğe bağlı olarak türetir.
DEFAULT_TIMEFRAMES = ["1m", "5m", "15m", "1h", "1d"]

# Zaman dilimi başına, geriye dönük ne kadar veri isteneceği (DataLoader zaten
# sadece eksik kısmı çeker; bu sadece "istenen" pencereyi belirler).
_LOOKBACK_DAYS = {
    "1m": 90,
    "5m": 180,
    "15m": 365,
    "1h": 730,
    "1d": 1825,
}


def run_market_update(
    providers: list[str] | None = None,
    timeframes: list[str] | None = None,
    sleep_seconds: float = 0.3,
) -> dict:
    providers = providers or DEFAULT_PROVIDERS
    timeframes = timeframes or DEFAULT_TIMEFRAMES

    loader = DataLoader()
    now = utc_now()

    success_count = 0
    error_count = 0
    total = 0

    print(f"=== Gece Yarısı Piyasa Verisi Güncellemesi Başladı ({now.isoformat()}) ===")

    for provider in providers:
        symbol_items = get_symbols(provider)
        symbols = [item["symbol"] for item in symbol_items]
        print(f"\n--- {provider.upper()}: {len(symbols)} sembol ---")

        for timeframe in timeframes:
            start_time = now - timedelta(days=_LOOKBACK_DAYS.get(timeframe, 365))

            for symbol in symbols:
                total += 1
                try:
                    df = loader.load_data(
                        provider_name=provider,
                        symbol=symbol,
                        timeframe=timeframe,
                        start_time=start_time,
                        end_time=now,
                    )
                    if df.empty:
                        print(f"[{provider}:{symbol} {timeframe}] Uyarı: veri dönmedi")
                    success_count += 1
                except Exception as e:
                    print(f"[{provider}:{symbol} {timeframe}] Hata: {e}")
                    error_count += 1

                time.sleep(sleep_seconds)

    print("\n==========================================")
    print("Gece Yarısı Güncellemesi Tamamlandı")
    print(f"Başarılı: {success_count} / {total}")
    print(f"Hatalı:   {error_count} / {total}")
    print("==========================================")

    return {"total": total, "success": success_count, "error": error_count}


def main() -> None:
    parser = argparse.ArgumentParser(description="Gece yarısı toplu piyasa verisi güncelleme betiği.")
    parser.add_argument("--provider", action="append", choices=DEFAULT_PROVIDERS,
                         help="Sadece belirtilen sağlayıcı(lar). Birden fazla kez verilebilir. Verilmezse hepsi.")
    parser.add_argument("--timeframe", action="append", choices=list(_LOOKBACK_DAYS.keys()),
                         help="Sadece belirtilen zaman dilimi(leri). Birden fazla kez verilebilir. Verilmezse hepsi.")
    parser.add_argument("--sleep", type=float, default=0.3, help="İstekler arası bekleme (saniye)")
    args = parser.parse_args()

    run_market_update(
        providers=args.provider,
        timeframes=args.timeframe,
        sleep_seconds=args.sleep,
    )


if __name__ == "__main__":
    main()
