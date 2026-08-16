# Trading Research Platform — Yol Haritası

## Vizyon
TradingView klonu değil; **manuel backtest, strateji araştırması ve teknik analiz odaklı** bir web platform.

## Tech Stack
- **Frontend:** React + TypeScript, grafik için `lightweight-charts`, Vercel'e deploy edilir
- **Backend:** Python (FastAPI), REST API (`/api`), Render'a deploy edilir
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

> **Durum işaretleri:** ✅ tamam · ⚠️ kısmen (eksik maddeler ayrıca işaretli) · ⬜ başlanmadı.
> Son gözden geçirme: 2026-08-16.

## Faz 1 — MVP ✅
- Mum/çizgi grafiği, zoom, pan, crosshair, ölçüm araçları
- Veri: Binance, Nasdaq, BIST100 (OHLCV, çoklu zaman dilimi)
- Replay Engine: tarihe gitme, tek mum ilerletme, play/pause, hız kontrolü, klavye kısayolları
- Göstergeler: EMA, SMA, RSI, MACD, ATR, Bollinger Bands, ADX, Volume MA

## Faz 2 — Strateji Motoru ✅
- Rule Engine: JSON tabanlı koşul tanımı (örn. `EMA20 > EMA50 AND RSI < 30 => BUY`)
- Strateji oluşturma/düzenleme/silme, JSON olarak saklama
- Parametre sistemi: kod değiştirmeden ayarlanabilir değerler
- Çoklu timeframe filtreleme (örn. grafik 15m + filtre 4H EMA200)

## Faz 3 — Scanner & Watchlist ⚠️
- ✅ Stratejiyi tüm sembollerde (Binance/Nasdaq/BIST) çalıştırma, sinyal listesi
  — `engines/scanner_engine.py` + Strateji Motoru içindeki "Toplu tarama" sekmesi.
  Tarama geçmişi `strategy_scans` tablosunda kullanıcı bazlı saklanıyor.
- ⬜ **Pattern Search**: belirli koşulların oluştuğu geçmiş bölgeleri işaretleme — yazılmadı
- ✅ Watchlist: izleme listesi, sinyal renklendirme, sürükle-bırak sıralama, bölümler, notlar
- ⚠️ Alarm Sistemi: koşul bazlı alarm motoru çalışıyor (`alerts/engine.py`), tetiklenme
  ekranda modal ve sesle bildiriliyor.
  ⬜ **Telegram entegrasyonu yazılmadı** — `alerts/telegram.py` ve `alerts/notification.py`
  hâlâ birer satırlık iskelet. Uygulama kapalıyken alarm kullanıcıya ulaşmıyor.
- ⬜ Ayrı "Scanner" sekmesi: menüde var ama yer tutucu ekran gösteriyor; tarama bugün
  Strateji Motoru içinden yapılıyor.

## Faz 4 — Manuel Backtest ⚠️
Çekirdeği çalışıyor ve kullanılabilir; eksik olan tek madde işlemin "neden"ini yazmak.
- ✅ Replay sırasında işlem açma, stop/take-profit belirleme
- ✅ Trade Journal: işlem listesi, oturum bazlı kayıt
- ✅ Performans Raporu: Win Rate, Loss Rate, Profit Factor, Sharpe, Drawdown, Net Profit
- ⬜ **İşleme not ve ekran görüntüsü ekleme** — manuel backtest'in öğreten kısmı bu,
  şu an hiçbir yere yazılmıyor

## Faz 4.5 — Hesap Modeli ✅
- Komisyon + slipaj (`engines/execution.py`), iki motorda da ortak
- Pozisyon boyutlandırma: sabit adet / sabit tutar / bakiye yüzdesi / risk yüzdesi
- Strateji testinde tam metrik seti (Sharpe, drawdown, profit factor, bakiye eğrisi)
- Al-tut karşılaştırması
- Replay oturumunda gerçek hesap bakiyesi

## Faz 4.6 — Kural DSL'i ✅
- İç içe koşul grupları: `(A VE B) VEYA (C VE D)`
- Aritmetik operand: `close < giriş − 2×ATR`
- Gösterge kaydırma (`offset`) + `rising`/`falling` operatörleri
- Kaydetme anında doğrulama (422 + hata listesi)
- Hazır strateji şablonları

## Faz 4.7 — Karşılaştırma ve Manuel Backtest Deneyimi ✅
- Aynı pencerede manuel sonuç vs strateji sonucu (`engines/comparison.py`)
- Portföy testi: çoklu sembol tek hesap, eş zamanlı pozisyon sınırı
- İşlem listesi CSV dışa aktarımı
- Replay klavye kısayolları (L/S/K) ve oturum özeti
- Kör mod: sembol ve tarih gizli manuel test

## Faz 4.8 — Tasarım sistemi ve cihaz uyumu ✅
Ürün fazı değil ama ürünün görünen yüzü; roadmap'te izi olmadığı için buraya yazıldı.
- Tek tasarım dili: rol taşıyan token'lar (`surface`, `content`, `line`, `accent`),
  ham Tailwind renkleri kaldırıldı. Kural: **yeşil/kırmızı yalnızca kâr/zarar demek** —
  birincil buton ve aktif sekme `accent` kullanır. Otorite: [DESIGN.md](DESIGN.md)
- Kendi sunucumuzdan IBM Plex Sans/Mono, her yerde tabular rakamlar
- Tarayıcı yüzeyleri temalandı: seçim, caret, odak halkası, scrollbar
- Dar ekran uyumu (`lg` eşiği): telefonda grafik tuvali 0 piksele düşüyordu —
  yan paneller artık grafiğin üstüne binen katman, araç çubuğu sarmalanıyor,
  strateji ekranı ana-detay. Dokunmatikte hover'a bağlı kontroller erişilebilir.
- ⬜ Gerçek cihazda gözle doğrulama yapılmadı (ölçümle doğrulandı)

## Platform ve altyapı ✅
Faz listesinde yer almayan ama tamamlanmış işler.
- Google OAuth + uygulama JWT'si; her strateji/alarm/watchlist ucu kullanıcıya kilitli
  (başkasının kaydına 403 değil **404** — varlık sızdırılmıyor)
- Admin paneli ve `ADMIN_EMAILS` ile router seviyesinde yetki
- Alembic migration'ları (`create_all` bilinçli olarak kaldırıldı)
- Sentry (iki tarafta da, DSN boşken devre dışı)
- Landing page + bekleme listesi, Vercel/Render dağıtımı, CI (build + ruff + unittest)
- 20 test modülü
- Launch öncesi kontrol listesi: [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md)

## Faz 5 — Gelişmiş Analiz ⬜
`optimizer/parameter_search.py` ve `engines/backtest_engine.py` birer satırlık iskelet.
- Parameter Optimizer: parametre aralıklarının tüm kombinasyonlarını tarama
- Walk Forward Test: overfitting analizi
- Monte Carlo: risk analizi
- ✅ Portfolio Test: çoklu sembol eşzamanlı test — Faz 4.7'de sermaye paylaştırmalı
  portföy sonucu olarak geldi (`portfolio_from_batch`)

## Faz 6 — AI Özellikleri ⬜
`ai/analyzer.py` ve `ai/strategy_generator.py` birer satırlık iskelet.
- Doğal dil ile strateji tanımlama → JSON kurala çevirme
- AI destekli analiz: seçilen noktada sinyal + gerekçe + güven skoru
- Benzer senaryolar: geçmişte benzeşen işlemleri bulma, başarı oranı, ortalama getiri

---

## Açık kalan işler

Yukarıda ⬜ ile işaretlenenlerin tek listesi. Sıra bir öneridir, karar sizin —
ölçüt: "kullanıcı bugün neyi yapamıyor?"

1. **Telegram/e-posta bildirimi.** Alarm motoru çalışıyor ama tetiklenme yalnızca
   uygulama açıkken duyuluyor; alarmın asıl değeri kapalıyken haber vermesi.
2. **Scanner sekmesi.** Menüde duruyor, yer tutucu gösteriyor. Motor hazır, eksik olan
   kendi ekranı.
3. **Pattern Search** (Faz 3'ten kalan).
4. **İşleme not / ekran görüntüsü** (Faz 4'ten kalan) — manuel backtest'in "neden"i
   şu an hiçbir yere yazılmıyor.
5. **Faz 5** — optimizer, walk-forward, Monte Carlo.
6. **Faz 6** — AI.

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
