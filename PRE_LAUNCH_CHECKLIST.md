# Canlıya Alma Öncesi Kontrol Listesi

Bu dosya, uygulamayı gerçek kullanıcılara açmadan önce yapılması/gözden geçirilmesi gereken
maddeleri toplar. Kritik maddeler güvenlik ve veri kalıcılığıyla ilgili — özellik eksikliğinden
önce bunlar çözülmeli. [roadmap.md](roadmap.md) ürün fazlarını, bu dosya launch hazırlığını takip eder.

Tamamlanan maddeleri `[x]` yaparak işaretleyin.

---

## 🔴 Kritik — launch'u bloklar

- [x] **Dev-login backdoor'u kapat.** [backend/app/auth/router.py](backend/app/auth/router.py) —
  eskiden `credential == "dev_mock_google_token"` veya `dev_` ile başlayan **her token**, hiçbir
  ortam kontrolü olmadan gerçek bir JWT ile `demo.trader@example.com` olarak giriş yaptırıyordu.
  Ayrıca Google doğrulaması başarısız olduğunda veya `GOOGLE_CLIENT_ID` boşken imzası doğrulanmamış
  herhangi bir JWT'yi (istenen `email` claim'i ile) kabul eden bir yedek yol vardı — bu, kimliği
  sahtelenmiş bir token ile herhangi bir kullanıcı olarak giriş yapılmasına izin veriyordu.
  Artık: (1) imzasız/yedek JWT kabulü tamamen kaldırıldı, `GOOGLE_CLIENT_ID` boşsa veya doğrulama
  başarısız olursa istek reddediliyor; (2) dev girişi yalnızca `.env`'deki `DEV_LOGIN_TOKEN` boş
  olmadığında ve gönderilen credential ona **birebir** eşit olduğunda çalışıyor (bkz.
  [backend/.env.example](backend/.env.example)), varsayılan olarak kapalı; (3) frontend'deki
  herkese açık "Demo/Test Hesabı ile Giriş Yap" butonu tamamen kaldırıldı. Kendi test hesabınız
  için `DEV_LOGIN_TOKEN`'ı yalnızca kendi ortamınızda (yerelde veya kendi Render env'inizde),
  rastgele üretilmiş uzun bir gizli değerle doldurun ve kimseyle paylaşmayın.

- [x] **Kalıcı veritabanı doğrulanmalı.** Render'da `DATABASE_URL` gerçek bir Postgres'e
  ayarlanmazsa uygulama SQLite dosyasına düşer; Render'ın diski kalıcı olmadığından her
  yeniden deploy/uykudan uyanışta **tüm kullanıcılar, stratejiler ve alarmlar silinir**
  ([backend/.env.example](backend/.env.example) içindeki uyarıya bakın). Gerçek kullanıcı verisi
  girmeden önce Render dashboard'dan bu değişkenin kalıcı bir Postgres'e işaret ettiğini teyit edin.

- [x] **JWT_SECRET_KEY / GOOGLE_CLIENT_SECRET gerçek değerlerle ezilmeli.**
  [backend/app/core/config.py:12-14](backend/app/core/config.py#L12) içinde bir Google client ID ve
  dev JWT secret'ı pydantic-settings varsayılanı olarak hardcode edilmiş. Render ortam
  değişkenlerinde bunların üretime özel, gerçek değerlerle geçersiz kılındığından emin olun —
  aksi halde token'lar herkesin bildiği bir secret ile imzalanmış olur.

- [x] **ADMIN_EMAILS Render'da doğru ayarlı mı kontrol edin.** Boşsa hiç kimse admin sayılmaz
  (güvenli varsayılan, ama admin paneli kullanılamaz); yanlış e-posta girilirse yanlış hesap
  admin yetkisi kazanır. `.env.example` içindeki formatı takip edin (virgülle ayrılmış liste).

- [ ] **Backend testleri ve lint CI'ya eklenmeli.**
  [.github/workflows/build.yml](.github/workflows/build.yml) şu an yalnızca frontend build'i
  çalıştırıyor. Bu oturumda admin panelindeki `/stats` ve `/users` uçlarının **her açılışta 500
  verdiği** bir bug bulundu (`Alert.is_active` diye var olmayan bir kolona erişiyordu) — hiçbir
  test bunu yakalamadı çünkü admin route'ları için test dosyası hiç yok. En azından
  strateji/alarm/admin uçları için smoke test'ler ve CI'da `python -m unittest` + `ruff check`
  adımı ekleyin.

- [x] **Piyasa verisi retention/pruning uygulanmalı.** `DataLoader._prune_to_retention`
  (`RETENTION_1M/1H/1D`, [config.py:43-45](backend/app/core/config.py#L43)) artık her yüklemede
  eski barları kırpıyor, ve [scripts/update_market.py](scripts/update_market.py) gece yarısı tüm
  sembol/zaman dilimlerini toplu çekiyor (bkz. commit "piyasa verisini gece yarısı toplu işle
  önceden çek"). Not: bu betiğin Render'da bir cron job / scheduled task olarak
  bağlandığını ayrıca teyit edin — repo'da script var ama zamanlayıcı ayarı bu dosyanın
  kapsamı dışında.

---

## 🟡 Önemli — kısa vadede yapılmalı

- [ ] **Boş (stub) sekmeler kullanıcıya görünüyor.** Sidebar'da ("Scanner", "Backtest", "Trade
  Journal") hâlâ listeleniyor ([Sidebar.tsx:27-29](frontend/src/components/Sidebar.tsx#L27)) ve
  arkalarındaki `engines/backtest_engine.py`, `journal/`, `reports/` hâlâ stub. Kısmen iyileşme
  var: tıklanınca artık boş beyaz ekran değil, "Bu özellik Yol Haritası üzerindeki gelecek
  fazlarda aktive edilecektir" mesajlı bir placeholder kart gösteriliyor
  ([App.tsx:546-558](frontend/src/App.tsx#L546)). Yine de karar verilmeli: launch'a kadar bu
  sekmeleri sidebar'dan tamamen gizlemek mi, yoksa placeholder'ı yeterli görmek mi.

- [x] **Hata izleme (error monitoring) ekleyin.** Kod tarafı artık tam bağlı: backend
  `init_error_monitoring()` ([main.py](backend/main.py)) ve frontend `initSentry()`
  ([utils/sentry.ts](frontend/src/utils/sentry.ts)) + `ErrorBoundary` hazır, sadece `SENTRY_DSN`
  boşken no-op. Kalan iş kod değil, konfigürasyon: Sentry'de proje açıp DSN'leri üretmek ve
  Render (`SENTRY_DSN`, `ENVIRONMENT=production`) ile Vercel (`VITE_SENTRY_DSN`) ortam
  değişkenlerine girmek — bu adım otomatikleştirilemez, elle yapılmalı.

- [ ] **Veri sağlayıcı isteklerine rate limiting ekleyin.** `market/data` ucu Yahoo Finance ve
  Binance'e doğrudan proxy yapıyor, kullanıcı başına throttling yok. Gerçek trafik altında
  sunucunuzun IP'si bu sağlayıcılar tarafından geçici olarak engellenebilir.

- [ ] **Sessiz veri kırpma kullanıcıya bildirilmeli.** BIST/NASDAQ (Yahoo Finance) sağlayıcısı
  `1h` istekleri için pencereyi sessizce ~700 güne kırpıyor
  ([nasdaq.py:53-56](backend/app/data/providers/nasdaq.py#L53)) — kullanıcı daha eskisini istese
  bile hata almadan, sadece daha kısa veri alır. En azından bir UI ipucu/tooltip ile bu sınırı
  belirtin.

- [x] **Alerts/Scanner motorlarında benzer performans sorunları olup olmadığı gözden geçirilmeli.**
  Gözden geçirildi: `AlertEngine.check_alerts` ([backend/app/alerts/engine.py:220](backend/app/alerts/engine.py#L220))
  bar-by-bar bir döngü değil — kullanıcının aktif alarmlarını tek bir güncel fiyat/indikatör
  değeriyle karşılaştırıyor, O(n²) riski yok. `ScannerEngine` de kendi başına bar taramıyor;
  toplu tarama zaten düzeltilmiş `RuleEngine.evaluate_range`'i kullanan
  `StrategyEngine.evaluate_batch` üzerinden geçiyor. Ek bir aksiyon gerekmiyor.

---

## 🟢 Hukuki / güven — launch öncesi eklenmesi beklenir

- [ ] Kullanım Şartları (Terms of Service)
- [ ] Gizlilik Politikası (Privacy Policy) — Google OAuth ile toplanan verinin nasıl saklandığı
- [ ] "Bu platform yatırım tavsiyesi vermez" uyarısı (disclaimer) — trading'e yakın, hesaplı bir
  üründe beklenen asgari şeffaflık

---

## 🔵 Roadmap'te sırada — launch'u bloklamaz, sonraki iterasyonlar

Bkz. [roadmap.md](roadmap.md). Faz 1-3 (grafik, replay kontrolleri, strateji motoru, scanner,
watchlist, alarmlar) büyük ölçüde tamamlanmış durumda; aşağıdakiler henüz stub veya hiç
başlamamış:

- [ ] **Faz 4 — Manuel Backtest:** `engines/backtest_engine.py`, Trade Journal, Performans Raporu
  (Win Rate, Sharpe, Drawdown vb.)
- [ ] **Faz 5 — Gelişmiş Analiz:** Parameter Optimizer, Walk Forward Test, Monte Carlo, Portfolio
  Test
- [ ] **Faz 6 — AI Özellikleri:** doğal dil → JSON strateji çevirisi, AI destekli analiz
- [ ] `api/websocket.py` — canlı veri akışı için WebSocket desteği hâlâ stub

---

## Ek notlar

- Bu liste 2026-07-29 tarihli bir oturumdaki bulgulara dayanır; kod değiştikçe güncel kalması
  için periyodik olarak gözden geçirilmelidir.
- Maddeler tamamlandıkça bu dosyadan silinmek yerine `[x]` ile işaretlenmesi, gelecekte "neden bu
  karar alındı" sorusuna cevap bırakır.
