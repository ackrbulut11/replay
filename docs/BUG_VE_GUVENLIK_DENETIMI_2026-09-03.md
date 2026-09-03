# REPLAY — Hata ve güvenlik denetimi

Tarih: **3 Eylül 2026**. İncelenen sürüm: **4759793 üzerine çalışma kopyasındaki mevcut değişiklikler**. İnceleme başladığında kaydedilmemiş değişiklikler vardı; bulgular o güncel kod için geçerlidir. Uygulama kodu değiştirilmedi.

**Sonuç: 19 bulgu — 9 yüksek öncelikli (P1), 10 orta öncelikli (P2).** Özellikle hesaplar arası tarayıcı verisi izolasyonu ve araştırma sonuçlarının doğruluğu düzeltilmeli. Testlerin çoğunun geçmesi, aşağıdaki işlem ve zaman serisi hatalarını dışlamıyor.

P1, kullanıcı gizliliğini veya temel araştırma sonucunu doğrudan etkileyen ve öncelikle giderilmesi gereken sorunları ifade eder. P2, belirli akışları, hesap tutarlılığını, kaynak sınırlarını veya geliştirme/dağıtım doğrulamasını bozan sorunları ifade eder. Doğrulanmış bir P0/uzaktan kod çalıştırma bulgusu yoktur.

## Kapsam ve doğrulama

Kimlik doğrulama ve sahiplik kapıları; strateji/rule engine; çoklu zaman dilimi hizalama; emir gerçekleşmesi, boyutlandırma ve portföy; manuel replay/günlük; veri yükleme ve önbellek; frontend oturum ve store yönetimi; bağımlılıklar ve CI incelendi. RULES.md, SKILLS.md ve directory_structure.md okundu.

Hesaplama hataları sentetik mumlarla, veritabanı hataları geçici SQLite veritabanlarıyla, frontend oturum hataları gerçek TypeScript modülleri ve kontrollü yanıtlarla yeniden üretildi. Temel hesaplama örnekleri hem mevcut Python 3.9 ortamında hem güncel bağımlılıklarla oluşturulan ayrı Python 3.11 ortamında aynı sonucu verdi. Üretim sunucusuna saldırı veya yük testi yapılmadı; canlı Render/Vercel ayarları ve Postgres işlemleri doğrulanmadı.

| Kontrol | Sonuç |
|---|---|
| Frontend derlemesi | Başarılı: TypeScript ve Vite |
| Frontend lint | 0 hata, 48 uyarı |
| Frontend hesap testleri | 8/8 geçti |
| Backend lint | Başarılı |
| Güncel bağımlılıklarla Python 3.11 uygulama importu | Başarılı |
| Backend testleri | 534 test: 533 geçti, 1 hata — bulgu 02 |
| Temiz CI benzeri Python kurulumu | TestClient için `httpx2` eksik — bulgu 18 |
| Backend bağımlılık taraması | Requirements ve çözümlenen dolaylı bağımlılıklarda bilinen açık bulunmadı |
| Frontend bağımlılık taraması | Browserslist 4.28.6 için 1 yüksek önem dereceli paket, 2 güvenlik bildirimi — bulgu 19 |
| Tarayıcı testleri | Başarıyla doğrulanamadı: beklenen Chromium kurulmamıştı; kurulu Edge ile yapılan alternatif koşuda 5 test sayfa yükleme zaman aşımına uğradı |

Backend testleri kullanıcı veritabanından ayrı çalıştırıldı. Python 3.11 test sonucuna ulaşmak için yalnızca geçici denetim ortamına eksik `httpx2` paketi eklendi. İlk yerel koşudaki boş JWT anahtarına bağlı ortam hataları da geçici test ayarıyla ayrıştırıldı; 533/534 sonucu bu ortam sorunu giderildikten sonraki sonuçtur. Tarayıcı zaman aşımının kök nedeni belirlenmedi; uygulamada beş ayrı hata bulunduğu anlamına gelmez.

## Yüksek öncelikli bulgular

### 01 — P1 — Hesap değişiminden sonra önceki hesabın verileri yeni oturuma taşınabiliyor

**Konum:** [authSession.ts:34](C:/Users/ackrb/projects/replay/frontend/src/auth/authSession.ts:34), [chartSettingsStore.ts:380](C:/Users/ackrb/projects/replay/frontend/src/store/chartSettingsStore.ts:380), [watchlistStore.ts:351](C:/Users/ackrb/projects/replay/frontend/src/store/watchlistStore.ts:351), [strategyStore.ts:199](C:/Users/ackrb/projects/replay/frontend/src/store/strategyStore.ts:199).

Çıkış olayı bazı store'ları sıfırlıyor ancak devam eden isteklerin hangi kullanıcıya ait olduğunu denetleyen bir oturum sürümü yok. A hesabının grafik ayarları isteği beklerken çıkış yapılıp B hesabına girilirse, A'nın geç gelen yanıtı `currentState` ve yerel depolamaya uygulanabiliyor. Strateji store'u da çıkış olayında temizlenmiyor; seçili strateji ve araştırma verileri bellekte kalıyor. Sayfaların yeniden veri yüklemesi, bu izolasyonun yerine geçmiyor.

**Kanıt:** Gerçek store modülleriyle A isteği bekletildi, çıkış ve B girişi yapıldı, sonra A yanıtı tamamlandı. Güncel token B iken grafik durumunda `private-drawing-A` ve A'nın özel notu bulundu. Ayrı kontrolde B token'ıyla `activeStrategy.id = private-strategy-A` kaldı.

**Etki:** Aynı tarayıcıyı paylaşan hesaplar arasında özel strateji, not ve çizimlerin görünmesi; sonradan yapılan kayıtların yanlış hesaba ait veriyle karışması riski. Bu bulgu, backend'de başka kullanıcının kimliğiyle sorgu yapabilme açığı değildir.

**Öneri:** Kullanıcıya ait bütün store'ları temizleyin. İstek başında kullanıcı/oturum sürümünü alın, yanıtı uygulamadan ve yeniden denemeden önce doğrulayın; eski istekleri iptal edin veya sonuçlarını yok sayın.

### 02 — P1 — Manuel oturum/strateji karşılaştırması varsayılan parametreyle çöküyor

**Konum:** [strategy_engine.py:712](C:/Users/ackrb/projects/replay/backend/app/engines/strategy_engine.py:712), [engine.py:561](C:/Users/ackrb/projects/replay/backend/app/rules/engine.py:561), [journal.py:352](C:/Users/ackrb/projects/replay/backend/app/api/routes/journal.py:352).

`load_multi_tf_data()` için `param_overrides=None` geçerli bir varsayılan; fakat bu değer doğrudan `.items()` çağıran `_resolve_params()` fonksiyonuna aktarılıyor. Günlük karşılaştırma ucu bu argümanı vermiyor. Hata, ek zaman dilimi döngüsünden önce oluştuğu için stratejinin çoklu zaman dilimi kullanması da gerekmiyor.

**Kanıt:** `test_ust_zaman_dilimi_ana_pencereden_once_isitilir` hem Python 3.9 hem güncel Python 3.11 ortamında `AttributeError: 'NoneType' object has no attribute 'items'` verdi. Karşılaştırma yolunda aynı çağrı mevcut ve bu hata yakalanmıyor.

**Etki:** Gerekli işlem ve piyasa verisi mevcut olduğunda karşılaştırma akışı 500 hatasıyla kesilebilir.

**Öneri:** `None` değerini ortak yardımcıda boş sözlüğe dönüştürün. Günlük karşılaştırmasını gerçek yardımcıyla çalışan bir uç testiyle doğrulayın.

### 03 — P1 — Aylık mumun kapanışı erken kabul edilerek gelecekteki fiyat okunuyor

**Konum:** [evaluator.py:116](C:/Users/ackrb/projects/replay/backend/app/rules/evaluator.py:116), [evaluator.py:176](C:/Users/ackrb/projects/replay/backend/app/rules/evaluator.py:176).

Mum süresi bütün veri kümesindeki açılış aralıklarının medyanından çıkarılıyor. Aylar sabit uzunlukta olmadığı için bu süre gerçek kapanışı temsil etmiyor. Ayrıca süre hesabı değerlendirme anından sonraki zaman damgalarını da kullanıyor.

**Kanıt:** Şubat–Haziran 2024 aylık serisinde hesaplanan süre 30 gün 12 saat oldu. Saatlik grafikte 31 Mart 13:00 değerlendirmesi, 1 Nisan'da kapanacak Mart mumunun `999` kapanışını okudu. O anda kullanılabilecek son aylık kapanış `111` idi.

**Etki:** Henüz bilinmeyen üst zaman dilimi kapanışı, indikatörü veya fiyatı stratejiye sızar. RULES.md §19–23'ün yasakladığı lookahead bias oluşur.

**Öneri:** Gerçek zaman dilimini ve takvim/seans kurallarını taşıyın. Aylık kapanışı sabit/medyan gün sayısıyla hesaplamayın. Gelecek satırları değiştirme ve kesilmiş veriyle aynı geçmiş sonucu üretme testleri ekleyin.

### 04 — P1 — Portföy, aynı anda gelen sinyali gelecekteki çıkış zamanına göre seçiyor

**Konum:** [execution.py:322](C:/Users/ackrb/projects/replay/backend/app/engines/execution.py:322).

Portföye aday işlemler `(entry_timestamp, exit_timestamp)` ile sıralanıyor. Sermaye veya pozisyon sınırı nedeniyle adayların tamamı alınamıyorsa, gelecekte daha erken kapanacak işlem öne geçiyor. İşleme girerken bu bilgi bilinemez.

**Kanıt:** A ve B aynı anda giriş verdi, azami pozisyon sayısı 1 tutuldu. A'nın çıkışı 10, B'ninki 2 olduğunda B alındı. Girişteki veriler aynı bırakılıp yalnızca gelecekteki çıkış zamanları yer değiştirildiğinde A alındı.

**Etki:** Portföyün geçmişte hangi işlemi seçtiği gelecek bilgisine bağlıdır; rapor uygulanabilir bir seçim kuralını ölçmez.

**Öneri:** Eşzamanlı girişlerde yalnızca o anda bilinen, açık ve deterministik bir öncelik kullanın. Gelecek çıkış süresi ve test sonu getirisi seçim önceliğine girmemeli.

### 05 — P1 — Test sonunda açık kalan pozisyonlar portföyün sermaye sınırından kayboluyor

**Konum:** [strategy_engine.py:864](C:/Users/ackrb/projects/replay/backend/app/engines/strategy_engine.py:864), [strategy_engine.py:946](C:/Users/ackrb/projects/replay/backend/app/engines/strategy_engine.py:946).

Portföy yalnızca `closed_positions` listesini alıyor. Test sonunda açık olan pozisyon, daha önce bağladığı nakit ve kullandığı pozisyon hakkıyla birlikte tüm simülasyondan çıkarılmış oluyor.

**Kanıt:** A'nın açık LONG pozisyonu ve B'nin kapanmış işlemi portföye verildi. Tek pozisyon sınırına rağmen A giriş olarak hiç sayılmadı; B kabul edildi, `total_signals=1` döndü.

**Etki:** Gerçekte A'da bağlı olması gereken sermaye B için tekrar kullanılabilir. Test penceresini biraz uzatıp A'nın kapanmasını sağlamak, önceki sermaye tahsisini bile değiştirebilir.

**Öneri:** Açık pozisyonları gerçekleşmiş kâr/zarara katmadan giriş olayı, bağlı sermaye ve pozisyon hakkı olarak izleyin. Portföy girdisi yalnızca kapanmış işlem çiftlerinden oluşmamalı.

### 06 — P1 — Risk yüzdesine göre boyutlandırma, stratejinin stop seviyesini kullanmıyor

**Konum:** [strategy_engine.py:663](C:/Users/ackrb/projects/replay/backend/app/engines/strategy_engine.py:663), [execution.py:206](C:/Users/ackrb/projects/replay/backend/app/engines/execution.py:206).

`risk_percent` miktarı hesaplamak için `stop_price` bekliyor. Kural sinyallerinden nakit simülasyonuna taşınan işlem kaydında bu alan bulunmuyor. Stratejide `stop_loss_pct` olsa bile boyutlandırma, stop yokmuş gibi bakiyenin tamamına düşüyor.

**Kanıt:** 10.000 bakiye, %1 risk, %5 stop, 100 giriş ve 110 çıkış: doğru tahsis 2.000, doğru kâr 200. Uygulama 10.000 tahsis edip **1.000 kâr** raporladı.

**Etki:** Risk ayarı fiilen uygulanmıyor; getiri, düşüş ve karşılaştırma sonuçları yanlış pozisyon büyüklüğüyle hesaplanıyor.

**Öneri:** Gerçekleşmiş girişe ait stop seviyesini işlem kaydına taşıyın. Stop yokken risk modunu açık bir doğrulama hatasıyla ele alın. Bu kontrolü yalnızca `position_quantity` biriminde değil tam strateji değerlendirmesinde yapın.

### 07 — P1 — Düşük fiyatlı varlıkların işlem fiyatları sıfıra yuvarlanıyor

**Konum:** [engine.py:297](C:/Users/ackrb/projects/replay/backend/app/rules/engine.py:297), [engine.py:312](C:/Users/ackrb/projects/replay/backend/app/rules/engine.py:312), [execution.py:245](C:/Users/ackrb/projects/replay/backend/app/engines/execution.py:245).

Gerçekleşme ve giriş fiyatları hesaplama zincirinin içinde dört ondalığa yuvarlanıyor. Daha sonra nakit simülasyonu bu yuvarlanmış fiyatı kullanıyor ve sıfır fiyatlı işlemi atlıyor. Açık pozisyon raporu da sıfıra yuvarlanmış girişi geçersiz sayıyor.

**Kanıt:** `0.000010 → 0.000011` işleminde sinyal özeti **1 işlem, %10 getiri**, performans raporu ise **0 işlem, %0 getiri** döndürdü. İki sinyal fiyatı da `0.0` oldu.

**Etki:** Küçük fiyatlı kripto varlıklarda işlemler kaybolur; aynı yanıtın farklı bölümleri çelişir. Sıfır olmayan küçük fiyatlarda da miktar ve gösterilen fiyat bozulabilir.

**Öneri:** Hesaplama ve saklamada tam hassasiyeti koruyun; yuvarlamayı gösterime bırakın. Sembolün fiyat adımına uygun biçimlendirme kullanın.

### 08 — P1 — Eski mumlar eklenince stop kontrolü girişten önceki mumları değerlendirebiliyor

**Konum:** [App.tsx:286](C:/Users/ackrb/projects/replay/frontend/src/App.tsx:286), [ReplayTradePanel.tsx:133](C:/Users/ackrb/projects/replay/frontend/src/replay/ReplayTradePanel.tsx:133), [trade_journal.py:314](C:/Users/ackrb/projects/replay/backend/app/journal/trade_journal.py:314).

Grafiğin başına geçmiş mumlar eklenirken replay imleçleri kaydırılıyor; işlemin veritabanındaki `entry_bar_index` değeri ve panelin kontrol imleci aynı biçimde güncellenmiyor. Sunucu, mumun girişten sonra olup olmadığını zaman damgasıyla değil yalnızca bu değişken dizi indeksleriyle kontrol ediyor.

**Kanıt:** 10 Ocak'ta açılmış, giriş indeksi 5 olan pozisyona geçmiş derinleştirmesi sonrası indeks 6'daki 5 Ocak mumu gönderildi. Pozisyon **5 Ocak'ta CLOSED** oldu: kapanış tarihi giriş tarihinden önceye düştü.

**Etki:** Arka plan veri yükleme veya zaman dilimi/pencere değişimi, işlem açılmadan önce oluşmuş fiyatla stop çalıştırabilir.

**Öneri:** Pozisyon ve son değerlendirilen mumu zaman damgasıyla izleyin; sunucuda `bar.timestamp > entry_time` şartını uygulayın. Pencere indeksini kalıcı işlem kimliği olarak kullanmayın.

### 09 — P1 — Forex normalizasyonu geçerli mumların açılışını değiştiriyor

**Konum:** [loader.py:1019](C:/Users/ackrb/projects/replay/backend/app/data/loader.py:1019).

Verideki `open == close` oranı %10'u geçince bu mumların açılışı önceki kapanışla değiştiriliyor. Doji mumları geçerli piyasa verisidir; bu oran tek başına bozuk sağlayıcı verisini kanıtlamaz. Düzeltme, taze veri için de uygulanıyor.

**Kanıt:** Geçerli sentetik mumda `open=close=200`, `low=199`, `high=201` iken normalizasyon açılışı **100** yaptı. Böylece açılış, mumun en düşük fiyatının altına indi.

**Etki:** Açılış emirleri, boşluklu açılış hesabı ve mum formasyonları gerçek OHLC verisinden ayrılır. Hangi geçmiş mumun değişeceği, tüm serideki doji oranına da bağlıdır.

**Öneri:** Sağlayıcı kusurunu kaynağı ve veri sürümü bilinen kayıtlarla sınırlayın. Genel doji oranına bakarak fiyat uydurmayın; OHLC tutarlılığını doğrulayın.

## Orta öncelikli bulgular

### 10 — P2 — Sabit tutarlı/adetli boyutlandırma mevcut nakdi aşabiliyor

**Konum:** [execution.py:195](C:/Users/ackrb/projects/replay/backend/app/engines/execution.py:195), [execution.py:360](C:/Users/ackrb/projects/replay/backend/app/engines/execution.py:360).

Portföy serbest nakdi hesaplıyor fakat `fixed_cash` ve `fixed_units` bu sınırı uygulamıyor. `percent_equity` için de %100 üstünü engelleyen doğrulama yok.

**Kanıt:** 10.000 başlangıç bakiyesi ve 20.000 sabit tutar ile 20.000'lik pozisyon kabul edildi. Finansman/marjin modeli olmadan başlangıç sermayesinin iki katı kullanıldı.

**Etki:** Sermaye paylaşmalı testin nakit kısıtı boyutlandırma moduna bağlı olarak aşılabilir.

**Öneri:** Bütün modlarda ortak satın alma gücü kontrolü uygulayın; kaldıraç desteklenecekse bunun finansman ve marjin kurallarını açıkça modelleyin.

### 11 — P2 — Süresi geçmiş dakikalık önbellek yeni mumları 15 dakikaya kadar istemiyor

**Konum:** [loader.py:1190](C:/Users/ackrb/projects/replay/backend/app/data/loader.py:1190), [loader.py:1212](C:/Users/ackrb/projects/replay/backend/app/data/loader.py:1212).

Önbelleğin beş dakikalık tazelik süresi dolsa bile eksik son bölüm yalnızca fark 15 dakikayı aşınca indiriliyor. Bu sabit eşik 1m ve 5m zaman dilimleri için yeni kapanmış mumları atlıyor.

**Kanıt:** Son mumu 12:00 olan, dosya yaşı 10 dakika olan 1m önbelleğe 12:10'a kadar veri soruldu. Sonuç yine 12:00'da bitti; sağlayıcı çağrı sayısı **0** kaldı.

**Etki:** Grafik, fiyat ve araştırma girdileri bayat kalır; yeni mum beklenirken başarılı fakat eksik veri döner.

**Öneri:** Eksik mum kararını seçilen zaman dilimine ve kapanış zamanına bağlayın. Önbelleğin tazeliği ile tarih aralığını gerçekten kapsaması ayrı koşullar olmalı.

### 12 — P2 — Aynı pozisyonun eşzamanlı kapatılması kârı iki kez bakiyeye ekleyebiliyor

**Konum:** [trade_journal.py:232](C:/Users/ackrb/projects/replay/backend/app/journal/trade_journal.py:232), [trade_journal.py:265](C:/Users/ackrb/projects/replay/backend/app/journal/trade_journal.py:265).

Kapalı mı kontrolü belleğe alınmış ORM nesnesinde yapılıyor. İki istek aynı işlemi OPEN olarak okuduğunda ikisi de kontrolden geçebilir; durum değişimi ve bakiye güncellemesi tekil, koşullu bir veritabanı işlemiyle korunmuyor.

**Kanıt:** Aynı açık işlem iki veritabanı oturumuna önceden yüklendi ve iki kapanış uygulandı. Tek işlemde 10 kâr varken 10.000 bakiye **10.020** oldu. Veritabanında yalnızca bir işlem vardı.

**Etki:** Otomatik stop isteği ile manuel kapatma, iki sekme veya tekrar gönderim arasında yarış, bakiyeyi bozabilir.

**Öneri:** OPEN → CLOSED geçişini atomik ve koşullu yapın; yalnızca geçişi gerçekleştiren istek bakiyeyi değiştirsin. Bakiye güncellemesini de aynı işlem içinde güvenceye alın.

### 13 — P2 — Kapanmış işlem silindiğinde oturum bakiyesi düzeltilmiyor

**Konum:** [trade_journal.py:386](C:/Users/ackrb/projects/replay/backend/app/journal/trade_journal.py:386).

Silme yalnızca işlem satırını kaldırıyor. Kapatılırken `current_balance` alanına eklenen kâr/zarar geri alınmıyor.

**Kanıt:** 10.000'lik oturumda 10 kârla kapanan tek işlem silindi. Günlük raporu **10.000**, oturumun saklanan bakiyesi **10.010** oldu.

**Etki:** Kullanıcı aynı oturum için iki farklı bakiye görür; silinen işlem sonraki hesap durumunu etkilemeye devam eder.

**Öneri:** Silme ve bakiyeyi yeniden hesaplamayı tek veritabanı işlemi içinde yapın; alternatif olarak bakiyeyi kalan işlemlerden türetin.

### 14 — P2 — Manuel karşılaştırmanın düşüş hesabı ters işlem sırasıyla yapılıyor

**Konum:** [trade_journal.py:190](C:/Users/ackrb/projects/replay/backend/app/journal/trade_journal.py:190), [journal.py:294](C:/Users/ackrb/projects/replay/backend/app/api/routes/journal.py:294), [journal.py:320](C:/Users/ackrb/projects/replay/backend/app/api/routes/journal.py:320).

`list_trades()` en yeni işlemi önce döndürüyor. Normal günlük performansı listeyi kronolojik sıralıyor; karşılaştırma ucu ise aynı sıralamayı yapmadan rapor fonksiyonuna gönderiyor.

**Kanıt:** 10.000 başlangıçta önce -5.000, sonra +6.000 sonucunun doğru azami düşüşü **%50**. Ters listeyle karşılaştırma raporu **%31,25** hesapladı.

**Etki:** Aynı manuel oturumun karşılaştırma ekranındaki düşüşü ve sıra duyarlı metrikleri günlük raporundan farklı olabilir.

**Öneri:** Rapor üretiminden önce ortak bir kronolojik sıralama kullanın; normal günlük ile karşılaştırmada aynı işlemlerin aynı risk metriklerini ürettiğini sınayın.

### 15 — P2 — `rising`/`falling` aritmetik ifadelerde geçmişe bakmıyor

**Konum:** [evaluator.py:339](C:/Users/ackrb/projects/replay/backend/app/rules/evaluator.py:339), [evaluator.py:205](C:/Users/ackrb/projects/replay/backend/app/rules/evaluator.py:205).

Bu operatörler geçmiş değeri bulmak için sol operandın üstüne `offset` ekliyor. `expr` çözümleyicisi ise bu üst seviye offset'i işlemiyor; alt operandları yine aynı barda hesaplıyor.

**Kanıt:** Kapanışlar `[1, 2, 3, 4]` iken `(close - 0) rising 1` doğrulamadan geçti ancak **false** döndü. Geçmişteki 3 yerine mevcut 4 ile 4 karşılaştırıldı.

**Etki:** Geçerli olarak kaydedilen bir strateji yanlış sinyal üretir veya hiç tetiklenmez.

**Öneri:** İfade ağacının geçmiş değerini ortak zaman/offset çözümlemesiyle hesaplayın. Parametreli offset ve iç içe ifadeleri de kapsayın.

### 16 — P2 — Tekli strateji testi çoğu hisseyi ve Forex çiftlerini Binance'a gönderiyor

**Konum:** [StrategyPage.tsx:208](C:/Users/ackrb/projects/replay/frontend/src/pages/StrategyPage.tsx:208), [StrategyPage.tsx:218](C:/Users/ackrb/projects/replay/frontend/src/pages/StrategyPage.tsx:218).

Sağlayıcı, seçilmiş piyasa bilgisinden alınmıyor. Fonksiyon yalnızca 10 BIST ve 10 NASDAQ sembolünü tanıyor; diğer bütün sembolleri `binance` olarak sınıflandırıyor. Forex dalı hiç yok.

**Kanıt:** Kod yolu gereği `EURUSD`, `EUR/USD`, `PGSUS` ve `AVGO` → `binance`. `handleEvaluate()` bu sonucu doğrudan değerlendirme isteğinin sağlayıcısı olarak kullanıyor.

**Etki:** Grafikte doğru piyasadan seçilmiş birçok sembol tekli strateji testinde yanlış sağlayıcıya gider ve veri bulunamaz. Geçmiş kayıttan tekrar değerlendirme de aynı tahmine takılabilir.

**Öneri:** Seçili sembolü sağlayıcısıyla birlikte taşıyın; mevcut piyasa kataloğunu kullanın. Sabit isim listesiyle tahmin etmeyin.

### 17 — P2 — Örüntü arama ucu çalışma yükü sınırlarını atlatabiliyor

**Konum:** [patterns.py:27](C:/Users/ackrb/projects/replay/backend/app/api/routes/patterns.py:27), [patterns.py:43](C:/Users/ackrb/projects/replay/backend/app/api/routes/patterns.py:43), [patterns.py:139](C:/Users/ackrb/projects/replay/backend/app/api/routes/patterns.py:139).

Uç kimlik doğrulaması istiyor fakat piyasa/strateji uçlarındaki hız sınırlamasını kullanmıyor. Koşul ağacı ham sözlük olduğu için strateji şemasındaki grup başına koşul sınırına tabi değil. `limit_bars=0` ise belgelenmiş 20.000 mum tavanından sonra da veri kırpmasını tamamen atlıyor.

**Kanıt:** 101 koşullu istek kabul edildi. 20.000 üst sınırı tanımlı olmasına rağmen kontrollü sağlayıcıdan gelen **21.001 mumun tamamı** arama motoruna geçti.

**Etki:** Giriş yapabilen bir kullanıcı, büyük koşul ağacını geniş veride tekrar tekrar çalıştırarak CPU ve sağlayıcı kotasını tüketebilir. Gerçek hizmet kesintisi oluşturacak yük testi yapılmadı; sınırların atlandığı doğrulandı.

**Öneri:** Kullanıcı başına hız/eşzamanlı iş sınırı, toplam ağaç düğümü sınırı ve `0` dahil bütün seçeneklere uygulanan kesin mum tavanı ekleyin. İş yükünü yalnızca HTTP gövdesinin boyutuyla sınırlamayın.

### 18 — P2 — Temiz CI kurulumu backend test istemcisini içermiyor

**Konum:** [requirements.txt:1](C:/Users/ackrb/projects/replay/backend/requirements.txt:1), [build.yml:66](C:/Users/ackrb/projects/replay/.github/workflows/build.yml:66).

Güncel `starlette==1.6.0` test istemcisi `httpx2` istiyor. Requirements ve CI kurulum komutları bunu yüklemiyor. Mevcut yerel sanal ortamın eski FastAPI/Starlette sürümleri ve önceden yüklenmiş `httpx` paketi bu eksikliği maskeleyebilir.

**Kanıt:** Ayrı Python 3.11 ortamına CI ile aynı şekilde requirements, ruff ve pip-audit kuruldu. `pip check` ve `import main` başarılı oldu; `from fastapi.testclient import TestClient` ise **“requires the httpx2 package to be installed”** hatası verdi. Geçici ortama paket eklenince testler başladı ve bulgu 02'deki tek hata kaldı.

**Etki:** Temiz CI/test kurulumu, uygulama importu başarılı olsa bile test toplama aşamasında durur.

**Öneri:** Test bağımlılıklarını açıkça tanımlayıp CI'da yükleyin. Yerel ortamı da proje tarafından seçilen Python sürümü ve bağımlılıklarla eşitleyin.

### 19 — P2 — Frontend kilit dosyası güvenlik bildirimi bulunan Browserslist sürümünü sabitliyor

**Konum:** [package-lock.json:2280](C:/Users/ackrb/projects/replay/frontend/package-lock.json:2280), [build.yml:27](C:/Users/ackrb/projects/replay/.github/workflows/build.yml:27).

`npm audit`, **Browserslist 4.28.6** için iki bildirim döndürdü: sınırsız önbellek büyümesi ve güvenilmeyen özel istatistik verisinde çökme/prototip yazma. Bildirilen düzeltme sürümü **4.28.7**. Kaynaklar: [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g).

**Kanıt:** Denetim sırasında `npm audit` bir yüksek önem dereceli paket raporladı ve başarısız çıkış kodu döndürdü. CI aynı komutu zorunlu adım olarak çalıştırıyor.

**Etki:** Mevcut CI güvenlik kapısı geçmiyor. Bu projedeki görünür kullanım derleme araçları üzerinden; son kullanıcının bu açığı üretim arayüzünden tetikleyebildiği gösterilmedi. Paket bildirimindeki “high” derecesi, REPLAY'de doğrulanmış uzaktan saldırı ile eş tutulmamalı.

**Öneri:** Uyumlu yamalı sürüme geçip kilit dosyasını yenileyin; ardından audit ve derlemeyi doğrulayın.

## Ek eksikler ve denetimin sınırları

- **Tarayıcı test kapsamı temel kabukla sınırlı.** Beş mevcut UI testi giriş yönlendirmesi/sayfa açılışı gibi kontroller yapıyor. Strateji oluşturup değerlendirme, stop tetiklenmesi, geçmiş derinleştirmesi, hesap değiştirme ve karşılaştırma için tamamlanmış uçtan uca doğrulama yok. Bu denetimdeki tarayıcı koşuları da başarılı sayılamadı.
- **Test veritabanı izolasyonu varsayılan olarak zorunlu değil.** `backend/tests/__init__.py`, yapılandırılmış `DATABASE_URL` üzerinde migration çalıştırıyor; bazı API testleri aynı bağlantıyı kullanıyor. Bu denetim geçici URL vererek izolasyon sağladı. Test komutunun kullanıcı veritabanını kullanmasını kendiliğinden engelleyen bir güvence eklenmeli.
- **Belgeler güncel kodla çelişiyor.** SKILLS.md hâlâ test paketinde `__init__.py` olmadığını söylüyor. Proje yönergelerindeki Python 3.9/3.11 matrisi ve veritabanı modülü anlatımının bir kısmı da mevcut dosyalarla uyuşmuyor: etkin bağlantı `database/postgres.py` içinde, `sqlite.py` ise boş bir yer tutucu. Çalıştırma ve bakım hatası riski var.
- **Günlük raporları 1.000 işlemle sınırlandırılıyor.** Performans ve karşılaştırma, listeleme yardımcısının sınırını kullanıyor. Daha uzun geçmişte bütün hesap ömrünü kapsayan rapor için ayrı, sayfalama sınırına takılmayan sorgu gerekir; bu denetimde büyük geçmişle uç testi yapılmadı.
- **Faz 5–6 yer tutucuları mevcut.** Ayrı backtest/optimizer/AI/WebSocket ve bazı bildirim modülleri tamamlanmış özellik gibi değerlendirilmemeli. Belgelenmiş gelecek kapsam oldukları için bunlar 19 hata sayısına dahil edilmedi.
- **Üretim ayarları doğrulanmadı.** Render/Postgres yedekleri, gerçek CORS/cookie davranışı, proxy IP zinciri, Sentry teslimatı ve aktif ortam değişkenleri için ayrı üretim kontrolü gerekir. Koddaki ayarın varlığı, canlıda doğru uygulandığını kanıtlamaz.

Mevcut testlerde sahiplik izolasyonu ve istek gövdesinden kullanıcı kimliği değiştirme kontrolleri geçti. Admin uçlarının router seviyesinde korunması, token tür/sürüm kontrolleri, temel cache yolu doğrulaması ve ortak indikatör uyum testleri olumlu korumalar. Bunlar yukarıdaki bulguları ortadan kaldırmıyor; bu incelemede SQL enjeksiyonu, keyfi dosya okuma veya genel bir yetkisiz hesap erişimi doğrulanmadı.

## Önerilen düzeltme sırası

1. **Gizlilik:** 01 — store ve devam eden istekler için hesap izolasyonu.
2. **Araştırma doğruluğu:** 03–09 — zaman hizalama, portföy tahsisi, risk boyutu, hassasiyet, replay zaman kimliği ve ham veri bütünlüğü.
3. **Bozuk akış ve hesap tutarlılığı:** 02, 10–16 — karşılaştırma, bakiye işlemleri, veri tazeliği, DSL ve doğru piyasa seçimi.
4. **Kaynak koruması ve doğrulama altyapısı:** 17–19 — iş yükü sınırları, temiz test kurulumu ve yamalı bağımlılık.

Her düzeltme, bu rapordaki tetikleyici örneği bir regresyon testine dönüştürmeli. Özellikle gelecekteki veri değiştirildiğinde geçmişteki işlem seçiminin değişmemesi; aynı kullanıcının rapor bölümlerinin aynı işlem sayısını/bakiyeyi vermesi; hesap değişiminden sonra eski yanıtların uygulanmaması kabul ölçütü olmalı.
