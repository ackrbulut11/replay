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

> **Durum işaretleri:** ✅ tamam · 🔄 üzerinde çalışılıyor · ⚠️ kısmen (eksik maddeler
> ayrıca işaretli) · ⬜ başlanmadı. Son gözden geçirme: 2026-08-22.

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
- ⬜ **Pattern Search** — kapsamı büyüdüğü için ayrı faza taşındı, bkz. [Faz 3.5](#faz-35--örüntü-arama)
- ✅ Watchlist: izleme listesi, sinyal renklendirme, sürükle-bırak sıralama, bölümler, notlar
- ⚠️ Alarm Sistemi: koşul bazlı alarm motoru çalışıyor (`alerts/engine.py`) ve artık
  **arka planda da tarıyor** (`check_all_active_alerts`, varsayılan 5 dk): eskiden alarm
  yalnızca kullanıcı o sembole bakarken değerlendiriliyordu, yani THYAO alarmı ancak
  THYAO ekranı açıkken tetikleniyordu. Gösterge alarmları kapanmış mumla okunuyor —
  oluşan mum kalıcı yanlış tetikleme üretiyordu. Tetiklenme ekranda modal ve sesle
  bildiriliyor.
  ⬜ **Telegram/e-posta entegrasyonu yazılmadı** — `alerts/telegram.py` ve
  `alerts/notification.py` hâlâ birer satırlık iskelet. Alarm arka planda tetikleniyor
  ama kullanıcı ancak uygulamayı açınca görüyor.
- ⬜ Ayrı "Scanner" sekmesi: menüde var ama yer tutucu ekran gösteriyor; tarama bugün
  Strateji Motoru içinden yapılıyor.

## Faz 4 — Manuel Backtest ⚠️
Çekirdeği çalışıyor ve kullanılabilir; eksik olan tek madde işlemin "neden"ini yazmak.
- ✅ Replay sırasında işlem açma, stop/take-profit belirleme
- ✅ Trade Journal: işlem listesi, oturum bazlı kayıt
- ✅ Performans Raporu: Win Rate, Loss Rate, Profit Factor, Sharpe, Drawdown, Net Profit
- ⬜ **İşleme not / sebep yazma** — manuel backtest'in öğreten kısmı bu, şu an
  hiçbir yere yazılmıyor

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

## Faz 3.5 — Örüntü arama ⚠️

"Pattern search" üç ayrı şeye denk geliyor. Üçü de aynı çıktıyı üretir — **geçmişte
bir yerler listesi** — bu yüzden asıl iş üç arama değil, **sonuç yüzeyini bir kez
kurmak**: `bulucu → eşleşme listesi → grafikte işaretleme + replay imlecini oraya
atlatma`. Bulucular ona takılır.

Strateji testinden farkı: orada pozisyon durum makinesi var (giriş → çıkış → PnL).
Burada pozisyon yok, çıkış kuralı yok, kâr/zarar yok. Tek soru: **bu durum ne zaman
oluştu?** Kural kurmadan ÖNCEKİ aşama bu — "bu 3 yılda 40 kez mi oldu, 4 kez mi?"

### Kapsamda — ikisi de tamam ✅

- ✅ **Kural eşleşmesi.** `engines/pattern_engine.py`: bir koşul grubunun doğru olduğu
  bitişik bar aralıklarını döndürür. Pozisyon durum makinesi yok — eşleşen bar sayısı
  ve bölge sayısı ayrı raporlanır ("800 bar eşleşti ama 6 bölgede"). Uç:
  `api/routes/patterns.py`, arayüz: `strategy/PatternSearchPanel.tsx`
  (StrategyBuilder içinde).
- ✅ **Mum formasyonları.** 7 formasyon (`indicators/patterns.py`): yutan boğa/ayı,
  çekiç, kayan yıldız, doji, sabah/akşam yıldızı. İndikatör olarak kayıtlı, yani
  **strateji kurallarının içinde de** kullanılabiliyorlar ("yutan mum VE RSI<30").
  37 test.

### Bilinçli olarak ertelendi

- ⬜ **Grafik formasyonları** (OBO, üçgen, çift tepe). Nesnel tanımı yok: neyin OBO
  sayıldığına tolerans parametreleri karar verir, ayar değişince cevap değişir.
  Yanlış pozitif oranı yüksek, doğrulaması zor. Diğer iki maddenin toplamından
  büyük ve getirisi en belirsiz olan bu. Yapılacaksa kapsamı daraltılarak
  (yalnızca çift tepe/dip, pivotlardan) girilmeli.
- ⬜ **Benzerlik arama** ("şu ana benzeyen geçmiş pencereler"). Teknik tarafı kolay
  ama iki tuzağı var: (1) en-yakın-komşu her zaman bir şey döndürür ve görsel
  benzerliğin öngörü değeri düşüktür — tek "en iyi eşleşme" değil, N eşleşmenin
  **sonrasının dağılımı** gösterilmeli; (2) lookahead riski üründeki en keskin yer,
  hem arama havuzu hem "sonrasında ne oldu" ufku bar-index sınırlı olmalı
  (RULES.md §19–23). Faz 6'daki "Benzer senaryolar" maddesiyle aynı iş — orada
  değerlendirilmeli, burada değil.

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
- Landing page + bekleme listesi, Vercel/Render dağıtımı
- CI: frontend (eslint + build + Playwright) ve backend (ruff + import + unittest),
  Python 3.9 ve 3.11 matrisinde — üretim eskiden hiç test edilmemiş bir yorumlayıcıda
  koşuyordu
- 27 test modülü / 522 backend testi + 11 Playwright testi
- Launch öncesi kontrol listesi: [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md)

## Faz 4.9 — Doğruluk ve sağlamlaştırma ✅

Yeni özellik değil; var olanın **doğru sonuç ürettiğinden emin olma** turu. Kapsamlı bir
denetimde bulunan hatalar sırayla kapatıldı. Buraya yazılmasının sebebi: bunların
çoğu sessizce yanlış sayı üreten şeylerdi, yani "çalışıyor" görünüyorlardı.

### Backtest doğruluğu
- **TP/SL boşluklu mumda açılıştan doluyor.** Çıkış her zaman tam seviyeye eşitleniyordu:
  giriş 100, stop 95, mum 60'tan açtıysa zarar −%5 görünüyordu (gerçekte −%40). Bu, her
  kaybeden işleme `-stop_loss_pct` diye yapay bir taban koyuyordu — stop kullanan hiçbir
  stratejinin gerçek kuyruk riski görünmüyordu. Ortak hesap `execution.level_fill_price`,
  iki motor da onu kullanıyor.
- **Grafik ile backtest artık aynı sayıları üretiyor.** Göstergeler iki yerde, farklı
  formüllerle hesaplanıyordu (Bollinger'da popülasyon vs örneklem std → bant her barda
  ~%0,12 farklı ve hiç yakınsamıyor; EMA/RSI/MACD'de farklı tohumlama → EMA50'de %0,43).
  Altın örnek (`backend/tests/indicator_parity.json`) iki tarafı bağlıyor.
- **Açık pozisyon artık gizlenmiyor.** Al-tut benzeri bir strateji "0 işlem, %0 getiri,
  al-tut'un 196 puan gerisinde" diye raporlanıyordu. Metriklere girmiyor (kâr/zararı
  gerçekleşmemiş) ama `open_position` alanıyla görünüyor.
- **Manuel↔strateji karşılaştırması adil hale geldi.** Kıyas ölçüsü net kârdı ama iki
  taraf aynı tutarı riske atmıyor; ölçü ağırlıklı yüzdesel getiriye geçti ve stratejinin
  komisyon/slipajı manuel tarafa da uygulanıyor. Ayrıca strateji artık manuel oturumdan
  ~280 bar önce işlem açmıyor (ısınma payı değerlendirme aralığına karışıyordu).
- **Manuel replay'de stop/hedef gerçekten tetikleniyor.** Seviyeler kaydediliyor ve
  çiziliyordu ama hiçbir zaman tetiklenmiyordu — tek kapanış yolu "Kapat" düğmesiydi.
- **Max drawdown yüzdesi** mutlak en büyük düşüşün noktasında hesaplanıyordu; hesap
  büyüdükçe erken dönemdeki ağır yüzdesel düşüşler kayboluyordu (%50 yerine %20).

### Güvenlik
- Üretimde varsayılan JWT anahtarı ya da SQLite ile **açılış engelleniyor**. Anahtar
  ayarlanmamışsa depodaki geliştirme anahtarıyla token imzalanıyordu ve bütün sahiplik
  kapıları ona dayanıyor.
- **Refresh token iptal edilebilir** (`users.token_version`): çıkış yalnızca tarayıcıdaki
  çerezi siliyordu, sızmış token 14 gün geçerli kalıyordu.
- Google doğrulama hatasının ham metni istemciye dönüyordu; `/auth/*` uçları hız sınırı aldı.

### Altyapı
- **Tek `DataLoader`.** Beş ayrı örnek vardı; RAM önbelleği beşe kopyalanıyor ve parquet
  kilitleri ayrı ayrı çalıştığı için işe yaramıyordu. Önbellek artık satır bütçeli LRU
  (`MEM_CACHE_MAX_ROWS`) — eskiden hiç boşalmıyordu.
- **`import main` yan etkisiz.** Migration, zamanlayıcı ve ağ yoklaması modül seviyesinde
  çalışıyordu; CI'ın import kontrolü ve tüm test suite'i bunları tetikliyordu.
- Yahoo erişilemediğinde Twelve Data devreye giriyor (tek dış kaynağa bağımlılık).
- Retention zaman dilimi başına; olay tabloları budanıyor; loglama `logging`'e geçti ve
  yakalanan hatalar Sentry'ye gidiyor; `render.yaml` sürüm kontrolünde.

### Araçlar
- **Performans logu** (`app/core/perf.py` + `scripts/perf_log.py`): her isteği süre ölçüp
  insan dilinde etiketliyor ("ilk pencere" / "geçmiş derinleştirme") ve süreyi neyin
  harcadığını söylüyor (önbellek mi, sağlayıcı mı). Ayrı terminalde canlı izlenir.
- **eslint çalışıyor** (script vardı, bağımlılık yoktu — komut anında patlıyordu) ve
  frontend'de `any` sayısı 121 → 0.
- **Playwright kuruldu**: gösterge uyum testi + arayüz duman testleri.
- 22 ölü placeholder dosya silindi.

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

1. **Telegram/e-posta bildirimi.** Alarm motoru artık arka planda da tarıyor
   (uygulama kapalıyken de tetikleniyor), ama tetiklenmeyi DUYURACAK bir kanal yok:
   kullanıcı ancak uygulamayı açınca görüyor. `alerts/notification.py` ve
   `alerts/telegram.py` hâlâ boş; bot token'ı, kullanıcı başına chat kimliği ve
   bir şema değişikliği gerektiriyor.
2. **Scanner sekmesi.** Menüde duruyor, yer tutucu gösteriyor. Motor hazır, eksik olan
   kendi ekranı.
3. ~~Pattern Search~~ → [Faz 3.5](#faz-35--örüntü-arama) kapsamındaki iki madde
   (kural eşleşmesi, mum formasyonları) **tamamlandı**. Ertelenen iki maddesi
   (grafik formasyonları, benzerlik arama) orada gerekçesiyle duruyor.
4. **İşleme not / sebep yazma** (Faz 4'ten kalan) — manuel backtest'in "neden"i
   şu an hiçbir yere yazılmıyor.
5. **Faz 5** — optimizer, walk-forward, Monte Carlo.
6. **Faz 6** — AI.

## Sonraki Aşamalar (Backlog)
- Screener, Heatmap, çoklu grafik görünümü, Strategy Compare
- Risk Yönetimi: max günlük zarar, pozisyon büyüklüğü, risk/ödül, dinamik/ATR stop
- Bildirimler: Discord, Email, Desktop Notification

### Bilinen teknik borç (kayıt altında, bilinçli olarak ertelendi)
- **Göstergeleri backend'den çekmek.** `utils/indicators.ts` hesabı backend ile
  birebir eşitlendi ve bir altın örnekle bağlandı, ama hesap hâlâ iki yerde —
  RULES.md'nin "chart tarafına finansal hesap yazma" yasağı kâğıt üstünde
  ihlal edilmeye devam ediyor. Doğru çözüm serileri API'den almak; replay her
  mum adımında yeniden hesap istediği için önbellek/streaming tasarımı gerekiyor.
- **Gösterge ısınma payları.** `warmup_bars` EMA/RSI/ATR için ham `period`
  kullanıyor, oysa `ewm(adjust=False)` orada henüz yakınsamamış oluyor.
  Düzeltmek (ör. 3×period) her kayıtlı backtest sonucunu kaydırır, o yüzden
  ayrı ve ölçülerek yapılmalı.
- **React Compiler kuralları.** `react-hooks/refs`, `set-state-in-effect` ve
  `immutability` uyarıları açık (62 adet, çoğu `CandleChart.tsx`). Dosyanın
  testi yok; hepsini birden düzeltmek regresyon üretmenin kestirme yolu.
- **Python 3.11'e tam geçiş.** CI iki sürümde de koşuyor ama `backend/.venv`
  hâlâ 3.9 (ömrü dolmuş). `.venv` yeniden kurulup tüm suite orada
  doğrulanmalı.
- **Kalıcı disk.** `storage/market_data/` Render'da geçici diskte: her
  dağıtımda tüm parquet önbelleği ve gece yarısı işinin yazdıkları kayboluyor.
  Ücretli plan kararı (bkz. render.yaml).

---

## Geliştirme Prensipleri
- Önce çalışan sistem, sonra optimizasyon
- Her faz sonunda kullanılabilir bir ürün çıkmalı
- Modüller bağımsız, kod tekrarı yok
- Aynı strateji motoru canlı analiz ve replay'de kullanılır
- UI, veri katmanı ve strateji motoru birbirinden bağımsız
