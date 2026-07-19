# SKILLS.md — Trading Research Platform

Bu dosya, projenin farklı katmanlarında çalışırken uyulması gereken teknik pratikleri ve kullanılacak araç/kütüphaneleri tanımlar. Amaç: her modülün hangi "yetkinlik alanına" ait olduğunu ve o alanda nelere dikkat edilmesi gerektiğini netleştirmek.

## Backend — Python / FastAPI

- Route'lar ince tutulur; iş mantığı `engines/`, `rules/`, `journal/`, `reports/` altına yazılır.
- Veri işleme: `pandas` + `numpy`, gösterge hesaplama için `pandas-ta`.
- Tüm request/response modelleri Pydantic ile tanımlanır.
- WebSocket, canlı fiyat/replay akışı için kullanılır; REST, tek seferlik sorgular (strateji listeleme, backtest sonucu vb.) için.
- Zaman serisi işlemlerinde index her zaman `datetime` (UTC) olmalı, timezone karışıklığına izin verilmez.

## Frontend — React / TypeScript / Tauri

- Grafik: `lightweight-charts`. Kendi candlestick renderer'ı yazılmaz.
- UI bileşenleri: shadcn/ui + Tailwind, tutarlı tema (dark/light) üzerinden.
- State yönetimi: `store/` altında modül bazlı (chartStore, replayStore, userStore) — global tek bir dev state'e izin verilmez.
- Backend'e erişim sadece `services/api.ts` ve `services/websocket.ts` üzerinden yapılır; component içinden doğrudan fetch/WebSocket çağrısı yazılmaz.
- Tauri komutları (`src-tauri/src/commands.rs`) sadece dosya sistemi/process yönetimi gibi native ihtiyaçlar için kullanılır, iş mantığı içermez.

## Rule / Strategy Engine

- Kurallar JSON DSL ile tanımlanır (`condition`, `operator`, `value`, `logic`).
- Yeni bir operatör/koşul eklemek `rules/conditions.py` içinde küçük, test edilebilir bir fonksiyon olmalı.
- Engine, hem replay hem live modda aynı `evaluate()` fonksiyonunu kullanmalı.

## Data / Indicators

- Gösterge hesaplamaları `indicators/` altında kategori bazlı (`trend`, `momentum`, `volatility`) tutulur.
- Her gösterge fonksiyonu saf (pure) olmalı: aynı input → aynı output, yan etkisiz.
- Yeni piyasa/borsa eklemek `data/providers/base.py`'deki `IDataProvider` interface'ini implemente etmekle sınırlı olmalı.
- Her zaman dilimi için retention limiti `core/config.py`'den okunur; provider/loader bu limiti aşan eski veriyi indirmemeli veya indirse bile pruning ile temizlemeli (bkz. `RULES.md` §24-27).

## Veritabanı — SQLite

- Şema değişiklikleri migration dosyası olmadan yapılmaz (`database/migrations/`).
- Büyük OHLCV verisi SQLite'ta değil `storage/parquet/` altında tutulur; SQLite sadece strateji, trade, journal gibi ilişkisel veriler için kullanılır.

## Backtest / Optimizer

- Parameter Optimizer, kombinasyonları paralel/vektörize çalıştırmalı (brute-force nested loop yerine `itertools.product` + vektörize backtest) — ancak vektörizasyon lookahead bias'a yol açmamalı, her adım yalnızca o ana kadarki veriyi görmeli.
- Walk Forward ve Monte Carlo modülleri `optimizer/` altında ayrı dosyalarda olmalı, `backtest_engine.py` ile karıştırılmamalı.
- Backtest/replay engine'de mum işleme bar-by-bar yapılır, sinyal kapanan mumdan üretilip işlem bir sonraki mumda açılır (bkz. `RULES.md` §19-23).

## Test

- Backend: `pytest`, her engine (`replay`, `rules`, `scanner`, `backtest`) için ayrı test dosyası.
- Frontend: component testleri + `e2e/` altında Playwright ile kritik akışlar (replay oynatma, strateji oluşturma, backtest çalıştırma).
- Yeni bir rule/indicator eklerken en az bir unit test zorunlu.

## Genel

- Her modül kendi sorumluluğunda kalır; bir alanın pratiği diğerine sızmaz (örn. chart rendering mantığı backend'e yazılmaz).
- Belirsiz bir teknik karar varsa, `RULES.md` ve `directory-structure.md` referans alınır; onlarla çelişen bir yaklaşım uygulanmadan önce onay istenir.