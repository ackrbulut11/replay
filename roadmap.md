# Trading Research Platform — Yol Haritası

## Vizyon
TradingView klonu değil; **manuel backtest, strateji araştırması ve teknik analiz odaklı** bir masaüstü platform.

## Tech Stack
- **Frontend:** React + TypeScript + Tauri (UI shell), grafik için `lightweight-charts`
- **Backend:** Python (FastAPI), Tauri sidecar olarak çalışır, WebSocket ile frontend'e veri sağlar
- **Veritabanı:** SQLite
- **Strateji tanımı:** kod değil, JSON tabanlı Rule Engine

## Mimari
```
UI (React)
├── Chart Engine
├── Replay Engine
├── Rule/Strategy Engine
├── Indicator Engine
├── Scanner Engine
├── Watchlist
├── Alert Engine
├── Journal & Reports
├── Data Provider Layer
└── Local Database (SQLite)
```

## Tasarım Prensipleri
- Modüler, her bileşen bağımsız geliştirilebilir
- Replay ve canlı analiz aynı veri yapısını kullanır
- Strateji motoru grafikten bağımsız
- Veri sağlayıcıları değiştirilebilir (provider pattern)
- Strateji kod yazmadan, JSON kurallarla tanımlanır

---

## Faz 1 — MVP
- Mum/çizgi grafiği, zoom, pan, crosshair, ölçüm araçları
- Veri: Binance, Nasdaq, BIST100 (OHLCV, çoklu zaman dilimi)
- Replay Engine: tarihe gitme, tek mum ilerletme, play/pause, hız kontrolü, klavye kısayolları
- Göstergeler: EMA, SMA, RSI, MACD, ATR, Bollinger Bands, ADX, Volume MA

## Faz 2 — Strateji Motoru
- Rule Engine: JSON tabanlı koşul tanımı (örn. `EMA20 > EMA50 AND RSI < 30 => BUY`)
- Strateji oluşturma/düzenleme/silme, JSON olarak saklama
- Parametre sistemi: kod değiştirmeden ayarlanabilir değerler
- Çoklu timeframe filtreleme (örn. grafik 15m + filtre 4H EMA200)

## Faz 3 — Scanner & Watchlist
- Stratejiyi tüm sembollerde (Binance/Nasdaq/BIST) çalıştırma, sinyal listesi
- Pattern Search: belirli koşulların oluştuğu geçmiş bölgeleri işaretleme
- Watchlist: izleme listesi, sinyal renklendirme
- Alarm Sistemi: koşul bazlı bildirim, Telegram entegrasyonu

## Faz 4 — Manuel Backtest
- Replay sırasında işlem açma, stop/take-profit belirleme
- Trade Journal: not, ekran görüntüsü, sebep
- Performans Raporu: Win Rate, Loss Rate, Profit Factor, Sharpe, Drawdown, Net Profit

## Faz 5 — Gelişmiş Analiz
- Parameter Optimizer: parametre aralıklarının tüm kombinasyonlarını tarama
- Walk Forward Test: overfitting analizi
- Monte Carlo: risk analizi
- Portfolio Test: çoklu sembol eşzamanlı test

## Faz 6 — AI Özellikleri
- Doğal dil ile strateji tanımlama → JSON kurala çevirme
- AI destekli analiz: seçilen noktada sinyal + gerekçe + güven skoru
- Benzer senaryolar: geçmişte benzeşen işlemleri bulma, başarı oranı, ortalama getiri

---

## Sonraki Aşamalar (Backlog)
- Screener, Heatmap, çoklu grafik görünümü, Strategy Compare
- Risk Yönetimi: max günlük zarar, pozisyon büyüklüğü, risk/ödül, dinamik/ATR stop
- Bildirimler: Discord, Email, Desktop Notification

---

## Geliştirme Prensipleri
- Önce çalışan sistem, sonra optimizasyon
- Her faz sonunda kullanılabilir bir ürün çıkmalı
- Modüller bağımsız, kod tekrarı yok
- Aynı strateji motoru canlı analiz ve replay'de kullanılır
- UI, veri katmanı ve strateji motoru birbirinden bağımsız
