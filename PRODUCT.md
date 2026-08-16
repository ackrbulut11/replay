# PRODUCT.md — REPLAY

Impeccable'ın ürün bağlamı. Görsel kararlar için [DESIGN.md](DESIGN.md),
mimari kurallar için [RULES.md](RULES.md).

## Ne

Piyasa replay'i, manuel backtest ve JSON ile tanımlanan strateji araştırması
için bir trading araştırma platformu. Kullanıcı bir kuralı kodsuz kurar, tek
sembolde test eder, tüm izleme listesinde tarar ve aynı kurulumu bar bar —
sonrasını görmeden — yeniden oynatır.

## Kim için

Kendi kurulumunu sistematikleştirmek isteyen bireysel trader. Kod yazmıyor ama
RSI, EMA, drawdown, kazanma oranı ne demek biliyor. Terminal benzeri yoğun
arayüzlere (TradingView, Bloomberg) alışkın; boş beyaz alan ve büyük kart
düzenleri ona ürünün ciddiyetsiz olduğunu düşündürür.

Kullanım sahnesi: masaüstü, çoğunlukla karanlık oda ya da ikinci ekran, uzun
oturumlar. Koyu tema kategoriden değil bu sahneden geliyor.

## Ürünün duruşu

**Geleceği göremeyen bir backtest.** Ürünün tek gerçek iddiası bu: sinyal
yalnızca kapanmış bardan gelir, ileriye bakan erişim mimari olarak yasak
(RULES.md §19–23). Manuel replay ile otomatik strateji aynı motoru, aynı
rapor fonksiyonunu ve aynı işlem maliyetlerini paylaşır — bu yüzden ikisi
karşılaştırılabilir.

Arayüz bu dürüstlüğü taşımalı: uydurma metrik yok, "AI destekli" süsü yok,
gerçekte hesaplanmayan bir sayı ekranda görünmez.

## Durum

Faz 1–4 çalışıyor (grafik, indikatörler, kural motoru, strateji + tarayıcı,
alarmlar, replay, günlük, admin). Faz 5–6 (backtest raporları, optimizasyon,
WebSocket canlı veri, kaydedilmiş çalışma alanları) başlamadı. Landing sayfası
bunu açıkça söyler ve erken erişim listesi toplar — sattığı bir şey yok.

## Dil ve ses

Arayüz Türkçe, landing ve giriş ekranı İngilizce (hedef kitle uluslararası).
Ses: ölçülü, teknik, abartısız. Kontrol adları eylemi söyler; hata mesajı hem
sorunu hem çıkışı söyler. Ünlem yok, "Harika!" yok.

## Karşı-referanslar

- Kripto borsalarının neon-mor gradyanlı, animasyonlu, "kazanç" vaat eden dili.
- Genel SaaS şablonu: Inter, mor-mavi gradyan, kart içinde kart, her başlığın
  üstünde yuvarlak köşeli ikon karesi.
- Yeşili marka rengi olarak kullanan finans arayüzleri — burada yeşil bir
  anlam taşır, süs değil.
