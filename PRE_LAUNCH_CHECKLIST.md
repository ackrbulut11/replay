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

- [ ] **Kalıcı veritabanı doğrulanmalı.** Render'da `DATABASE_URL` gerçek bir Postgres'e
  ayarlanmazsa uygulama SQLite dosyasına düşer; Render'ın diski kalıcı olmadığından her
  yeniden deploy/uykudan uyanışta **tüm kullanıcılar, stratejiler ve alarmlar silinir**
  ([backend/.env.example](backend/.env.example) içindeki uyarıya bakın). Gerçek kullanıcı verisi
  girmeden önce Render dashboard'dan bu değişkenin kalıcı bir Postgres'e işaret ettiğini teyit edin.

- [ ] **JWT_SECRET_KEY / GOOGLE_CLIENT_SECRET gerçek değerlerle ezilmeli.**
  [backend/app/core/config.py:12-14](backend/app/core/config.py#L12) içinde bir Google client ID ve
  dev JWT secret'ı pydantic-settings varsayılanı olarak hardcode edilmiş. Render ortam
  değişkenlerinde bunların üretime özel, gerçek değerlerle geçersiz kılındığından emin olun —
  aksi halde token'lar herkesin bildiği bir secret ile imzalanmış olur.

- [ ] **ADMIN_EMAILS Render'da doğru ayarlı mı kontrol edin.** Boşsa hiç kimse admin sayılmaz
  (güvenli varsayılan, ama admin paneli kullanılamaz); yanlış e-posta girilirse yanlış hesap
  admin yetkisi kazanır. `.env.example` içindeki formatı takip edin (virgülle ayrılmış liste).

- [ ] **Backend testleri ve lint CI'ya eklenmeli.**
  [.github/workflows/build.yml](.github/workflows/build.yml) şu an yalnızca frontend build'i
  çalıştırıyor. Bu oturumda admin panelindeki `/stats` ve `/users` uçlarının **her açılışta 500
  verdiği** bir bug bulundu (`Alert.is_active` diye var olmayan bir kolona erişiyordu) — hiçbir
  test bunu yakalamadı çünkü admin route'ları için test dosyası hiç yok. En azından
  strateji/alarm/admin uçları için smoke test'ler ve CI'da `python -m unittest` + `ruff check`
  adımı ekleyin.

- [ ] **Piyasa verisi retention/pruning uygulanmalı.** [RULES.md §24-27](RULES.md) her sembol +
  zaman dilimi için sabit bir saklama limiti (`RETENTION_1M/1H/1D`, zaten
  [config.py:27-29](backend/app/core/config.py#L27) içinde tanımlı) ve periyodik otomatik
  temizlik şart koşuyor (`scripts/update_market.py`). Şu an bu limitler **hiçbir yerde
  kullanılmıyor** ve böyle bir script hiç yazılmamış — parquet cache dosyaları sınırsız büyüyor.
  Gerçek trafik altında disk kullanımı kontrolsüz artar.

---

## 🟡 Önemli — kısa vadede yapılmalı

- [ ] **Boş (stub) sekmeler kullanıcıya görünüyor.** Sidebar'da "Scanner", "Backtest", "Trade
  Journal" sekmeleri var ama CLAUDE.md'ye göre bunların arkasındaki
  `engines/backtest_engine.py`, `journal/`, `reports/`, ilgili sayfa bileşenleri hâlâ birer stub.
  Yeni bir kullanıcı bu sekmelere tıklayıp boş ekran görür. Ya bu sekmeleri geçici olarak gizleyin
  ya da (roadmap Faz 4'e göre öncelik sırasıyla) tamamlayın.

- [ ] **Hata izleme (error monitoring) ekleyin.** Production'daki 500 hatasını ancak manuel
  karşılaşınca fark ettik — hiçbir log/alarm sistemi yoktu. Sentry (veya benzeri) eklemek bir
  sonraki regresyonu aynı gün yakalamayı sağlar.

- [ ] **Veri sağlayıcı isteklerine rate limiting ekleyin.** `market/data` ucu Yahoo Finance ve
  Binance'e doğrudan proxy yapıyor, kullanıcı başına throttling yok. Gerçek trafik altında
  sunucunuzun IP'si bu sağlayıcılar tarafından geçici olarak engellenebilir.

- [ ] **Sessiz veri kırpma kullanıcıya bildirilmeli.** BIST/NASDAQ (Yahoo Finance) sağlayıcısı
  `1h` istekleri için pencereyi sessizce ~700 güne kırpıyor
  ([nasdaq.py:53-56](backend/app/data/providers/nasdaq.py#L53)) — kullanıcı daha eskisini istese
  bile hata almadan, sadece daha kısa veri alır. En azından bir UI ipucu/tooltip ile bu sınırı
  belirtin.

- [ ] **Alerts/Scanner motorlarında benzer performans sorunları olup olmadığı gözden geçirilmeli.**
  Bu oturumda `RuleEngine.evaluate_range`'de indikatör serilerinin her bar için yeniden
  hesaplandığı bir O(n²) hatası bulunup düzeltildi (bkz. commit "indikatör serilerini
  evaluate_range boyunca önbelleğe al"). `AlertEngine.check_alerts` gibi benzer bar-by-bar
  döngüler için de aynı örüntü kontrol edilmeli.

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
