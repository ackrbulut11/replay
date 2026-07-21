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

def main():
    parser = argparse.ArgumentParser(description="Download historical market data and cache it locally.")
    parser.add_argument("--provider", required=True, choices=["binance", "nasdaq", "bist"], help="Data provider name")
    parser.add_argument("--symbol", required=True, help="Market symbol (e.g. BTCUSDT, AAPL, THYAO)")
    parser.add_argument("--timeframe", required=True, choices=["1m", "5m", "15m", "1h", "4h", "1d"], help="Candle timeframe")
    parser.add_argument("--start", required=True, type=parse_date, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=parse_date, default=datetime.now(), help="End date (YYYY-MM-DD, defaults to today)")
    
    args = parser.parse_args()
    
    print(f"Initializing download for {args.provider.upper()}:{args.symbol.upper()} ({args.timeframe})...")
    print(f"Range: {args.start} to {args.end}")
    
    try:
        loader = DataLoader()
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
