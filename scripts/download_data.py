import os
import sys
import argparse
from datetime import datetime

# Uygulama modüllerini kolayca içe aktarabilmek için proje kök dizinini ve backend klasörünü sys.path'e ekle
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)
sys.path.insert(0, os.path.join(project_root, "backend"))

from app.data.loader import DataLoader

def parse_date(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            raise argparse.ArgumentTypeError(f"Not a valid date: '{date_str}'. Use YYYY-MM-DD or 'YYYY-MM-DD HH:MM:SS'.")

import os
import sys
import argparse
import time
from datetime import datetime

# Uygulama modüllerini kolayca içe aktarabilmek için proje kök dizinini ve backend klasörünü sys.path'e ekle
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)
sys.path.insert(0, os.path.join(project_root, "backend"))

from app.data.loader import DataLoader
from app.data.symbols import get_symbols

def parse_date(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            raise argparse.ArgumentTypeError(f"Not a valid date: '{date_str}'. Use YYYY-MM-DD or 'YYYY-MM-DD HH:MM:SS'.")

def main():
    parser = argparse.ArgumentParser(description="Download historical market data and cache it locally.")
    parser.add_argument("--provider", required=True, choices=["binance", "nasdaq", "bist"], help="Data provider name")
    parser.add_argument("--symbol", help="Market symbol (e.g. BTCUSDT, AAPL, THYAO). Set to ALL to download all symbols.")
    parser.add_argument("--all", action="store_true", help="Download all symbols for the specified provider")
    parser.add_argument("--timeframe", required=True, choices=["1m", "5m", "15m", "1h", "4h", "1d"], help="Candle timeframe")
    parser.add_argument("--start", required=True, type=parse_date, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=parse_date, default=datetime.now(), help="End date (YYYY-MM-DD, defaults to today)")
    
    args = parser.parse_args()

    if not args.all and not args.symbol:
        parser.error("Either --symbol <SYMBOL> or --all must be specified.")

    loader = DataLoader()
    
    if args.all or (args.symbol and args.symbol.upper() == "ALL"):
        symbol_items = get_symbols(args.provider)
        symbols = [item["symbol"] for item in symbol_items]
        print(f"=== Starting Batch Download for {len(symbols)} {args.provider.upper()} Symbols ===")
        print(f"Timeframe: {args.timeframe} | Range: {args.start.strftime('%Y-%m-%d')} to {args.end.strftime('%Y-%m-%d')}\n")
        
        success_count = 0
        error_count = 0
        
        for idx, sym in enumerate(symbols, 1):
            print(f"[{idx}/{len(symbols)}] Fetching {args.provider.upper()}:{sym}...")
            try:
                df = loader.load_data(
                    provider_name=args.provider,
                    symbol=sym,
                    timeframe=args.timeframe,
                    start_time=args.start,
                    end_time=args.end
                )
                if not df.empty:
                    cache_path = loader._get_cache_path(args.provider, sym, args.timeframe)
                    size_kb = os.path.getsize(cache_path) / 1024 if os.path.exists(cache_path) else 0
                    print(f"   -> Success: {len(df)} candles ({size_kb:.1f} KB)")
                    success_count += 1
                else:
                    print(f"   -> Warning: No data returned for {sym}")
            except Exception as e:
                print(f"   -> Error downloading {sym}: {e}")
                error_count += 1
            
            # Rate limiting sleep between requests
            time.sleep(0.3)

        print("\n==========================================")
        print(f"Batch Download Completed!")
        print(f"Successful: {success_count} / {len(symbols)}")
        print(f"Failed: {error_count} / {len(symbols)}")
        print("==========================================")
        return

    # Single symbol download
    print(f"Initializing download for {args.provider.upper()}:{args.symbol.upper()} ({args.timeframe})...")
    print(f"Range: {args.start} to {args.end}")
    
    try:
        df = loader.load_data(
            provider_name=args.provider,
            symbol=args.symbol,
            timeframe=args.timeframe,
            start_time=args.start,
            end_time=args.end
        )
        
        if df.empty:
            print("Download completed, but no data was returned.")
            return
            
        print("\n--- Download Succeeded ---")
        print(f"Total Rows: {len(df)}")
        print(f"Start Timestamp: {df['timestamp'].min()}")
        print(f"End Timestamp: {df['timestamp'].max()}")
        
        # Önbellek (cache) yolunu doğrula
        cache_path = loader._get_cache_path(args.provider, args.symbol, args.timeframe)
        print(f"Cached Parquet File: {cache_path}")
        print(f"File Size: {os.path.getsize(cache_path) / 1024:.2f} KB")
        print("--------------------------")
        
    except Exception as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

