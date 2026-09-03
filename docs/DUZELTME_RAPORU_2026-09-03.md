# REPLAY Düzeltme Raporu — 3 Eylül 2026

## Yüksek öncelikli

- **Hesap değişiminde veri karışabiliyordu:** Oturum nesli ve istek iptali eklendi; geç kalan API, refresh, store ve replay yanıtları artık yeni hesaba uygulanmıyor. Kullanıcıya bağlı store'lar çıkışta sıfırlanıyor.
- **Parametre verilmeden karşılaştırma çöküyordu:** `None` override merkezi olarak boş sözlüğe çevrildi.
- **Aylık/üst zaman dilimi geleceği görebiliyordu:** Mum kapanışı takvim dilimine göre hesaplandı; süre hesabının gelecekteki satırlardan etkilenmesi kaldırıldı.
- **Portföy sırası gelecekteki çıkış zamanına bağlıydı:** Eş zamanlı girişler sembole göre kararlı sıralanıyor.
- **Açık pozisyonlar portföy sermayesini bağlamıyordu:** Açık pozisyon, bağlı sermaye ve kullanılabilir nakit portföy simülasyonuna eklendi; veri sonunda sahte kapanış yapılmıyor.
- **Risk yüzdesi yanlış tutar üretiyordu:** Stop seviyesi işleme taşındı; stopsuz risk modu açık hata veriyor ve tüm boyutlandırmalar kaldıraçsız bakiyeyle sınırlandı.
- **Küçük fiyatlar sıfıra yuvarlanıyordu:** Hesaplama yolundaki 4 haneli yuvarlama kaldırıldı; CSV fiyat hassasiyeti 10 haneye çıkarıldı.
- **Replay'e eski mum eklenince stop girişten önce tetiklenebiliyordu:** Dizi indeksi yerine mum zamanı izleniyor; istek sürerken gelen mumlar sırayla işleniyor ve kontrol hatasında replay durduruluyor.
- **Forex mum fiyatları tahminle değiştiriliyordu:** `open == close` mumlarını önceki kapanışla değiştiren kurgu kaldırıldı.

## Diğer düzeltmeler

- **Taze fakat eksik önbellek tam sayılıyordu:** Kapsama, mum süresi ve güncel mum tazeliği ayrı kontrol ediliyor; eksik kısa son ek de sağlayıcıdan isteniyor.
- **Aynı işlem iki kez kapatılabiliyordu:** Kapatma tek atomik `OPEN → CLOSED` geçişine çevrildi; bakiye yalnızca kazanan istekte güncelleniyor.
- **İşlem silme bakiyeyi bozuk bırakıyordu:** Kapanmış işlem silinince gerçekleşen kâr/zarar aynı işlem içinde bakiyeden geri alınıyor.
- **Rapor sırası ve 1.000 işlem sınırı sonucu bozuyordu:** Raporlar tüm kapanışları piyasa çıkış zamanına göre kronolojik kullanıyor.
- **`rising/falling` aritmetik ifadelerde çalışmıyordu:** İfade offset'i tüm ifadeye uygulanıyor; parametreli offset ve warmup hesabı düzeltildi.
- **Sembol sağlayıcısı kısa bir listeyle tahmin ediliyordu:** Strateji testine açık piyasa seçici eklendi; mevcut grafik ve geçmiş kaydın sağlayıcısı korunuyor.
- **Örüntü araması kaynak tüketimine açıktı:** İstek şeması, toplam ağaç/koşul/parametre/bar sınırı, kullanıcı hız sınırı ve eşzamanlı tarama sınırı eklendi.
- **Testler gerçek geliştirme veritabanına bağlanabiliyordu:** Her test koşusu geçici SQLite kullanıyor; geliştirme bağımlılıkları ayrı ve sabit sürümlü dosyada toplandı.
- **Bağımlılık açığı vardı:** `browserslist` güvenli sürüme yükseltildi; npm denetimi artık 0 açık raporluyor.
- **Yerel çalışma ortamı eskiydi:** `.venv` Python 3.11 ile yeniden kuruldu; dokümantasyon ve CI geliştirme bağımlılık dosyasını kullanacak şekilde güncellendi.

## Doğrulama

- Backend: **543 test geçti**, uygulama import kontrolü geçti.
- Frontend: TypeScript ve üretim derlemesi geçti; ESLint **0 hata**; **11 mantık + 5 gerçek tarayıcı testi** geçti.
- Güvenlik: npm audit **0 açık**; Python paket denetimi **0 bilinen açık**.

Canlı Render/Vercel hesap ayarları yerel depodan doğrulanamaz. Kod, üretimde zayıf JWT anahtarı veya SQLite yapılandırmasıyla açılmayı zaten reddediyor; gerçek ortam değerleri panelde ayrıca kontrol edilmelidir.
