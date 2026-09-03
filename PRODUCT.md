# Product — REPLAY

<!-- impeccable:product-schema 1 -->

Impeccable ürün bağlamı. Görsel kararlar için [DESIGN.md](DESIGN.md), mimari
kurallar için [RULES.md](RULES.md) bağlayıcıdır.

## Platform

web

## Users

Birincil kullanıcı, kendi işlem kurulumunu sistematikleştirmek isteyen bireysel
trader'dır. Kod yazmadan RSI, EMA, drawdown ve kazanma oranı gibi kavramlarla
çalışır; stratejisini tarihsel veride sınamak, aynı kuralı izleme listesinde
taramak ve kararını geleceği görmeden bar bar tekrar etmek ister.

Kullanım çoğunlukla masaüstünde, uzun oturumlarda ve ikinci ekranla gerçekleşir.
Yoğun, terminal benzeri bir çalışma yüzeyi bu kullanımın doğal sonucudur.

## Product Purpose

REPLAY; piyasa replay'i, manuel backtest, işlem günlüğü ve JSON kural ağaçlarıyla
tanımlanan strateji araştırmasını tek platformda birleştirir. Başarı, kullanıcının
bir fikri kod yazmadan ifade edebilmesi ve manuel kararıyla otomatik stratejiyi
aynı veri, maliyet ve raporlama kuralları altında karşılaştırabilmesidir.

## Positioning

**Geleceği göremeyen bir backtest.** Sinyal yalnızca kapanmış bardan gelir;
ileriye bakan erişim mimari olarak yasaktır (RULES.md §19–23). Manuel replay ile
otomatik strateji aynı rapor fonksiyonunu, işlem maliyetlerini ve gerçekleşme
kurallarını paylaşır. Bu nedenle karşılaştırma yalnızca görsel değil, sayısal
olarak da aynı zemindedir.

## Operating Context

Kullanıcı sembol, sağlayıcı, zaman dilimi ve tarih aralığı seçer; grafiği ve
indikatörleri inceler; JSON tabanlı kural ağacını arayüzden kurar; tek sembolde
değerlendirir veya izleme listesinde toplu tarama başlatır. Aynı kurulum replay
modunda bar bar uygulanabilir; manuel işlemler günlüğe kaydedilip otomatik
stratejiyle karşılaştırılabilir.

## Capabilities and Constraints

- Çalışan kapsam: piyasa verisi ve sembol kataloğu, candlestick grafik ve çizim
  araçları, indikatörler, kural/strateji motoru, tekli değerlendirme, performans
  raporu, toplu tarama ve sermaye paylaşımlı portföy sonucu, alarmlar, izleme
  listeleri, replay, manuel işlem günlüğü ve karşılaştırma, admin ve analytics.
- Başlamamış kapsam: parametre optimizasyonu, WebSocket canlı veri, AI katmanı ve
  kaydedilmiş çalışma alanları. `backtest_engine.py`, `optimizer/`, `ai/` ve bazı
  route dosyaları bu gelecek fazlar için yer tutucudur.
- Stratejiler kullanıcıya ait JSON verisidir; strateji başına Python modülü
  oluşturulmaz. Kimlik ve sahiplik yalnızca sunucu token'ından gelir.
- Lookahead bias, negatif offset ve gelecek bara erişim yasaktır. Varsayılan
  gerçekleşme, kapanan bardaki sinyalden sonra bir sonraki barın açılışıdır.
- Frontend backend'e yalnızca `src/services/*` üzerinden erişir; kimlik öncesi
  auth akışları bu kuralın belgelenmiş istisnasıdır.
- Üretim frontend'i Vercel'de, API Render'da çalışır. Şema değişikliklerini
  Alembic yönetir.

## Brand Commitments

Ürün adı **REPLAY**'dir. Uygulama arayüzü Türkçe; landing ve giriş ekranı
uluslararası hedef kitle nedeniyle İngilizcedir. Ses ölçülü, teknik ve
abartısızdır. Kontroller eylemi; hata mesajları hem sorunu hem çıkış yolunu
söyler. Ünlemli kutlama dili, kazanç vaadi ve doğrulanmamış performans iddiası
kullanılmaz.

## Evidence on Hand

- Gösterge matematiği frontend ve backend arasında ortak altın fixture ile
  doğrulanır: `backend/tests/indicator_parity.json`.
- Manuel günlük ve strateji sonuçları aynı performans raporunu kullanır:
  `backend/app/reports/performance_report.py`.
- Ürün içi gerçek metrikler değerlendirme sonuçlarından ve saklanan tarama/
  günlük verilerinden gelir.
- Doğrulanmış müşteri sayısı, işlem hacmi, kazanma oranı, hız benchmark'ı,
  testimonial veya basın kanıtı yoktur; gelecekteki ürün metni bunları
  uydurmamalıdır.

## Product Principles

1. **Sonrasını gösterme.** Araştırmanın güvenilirliği her görsel kolaylıktan
   önce gelir.
2. **Aynı hesabı iki kez icat etme.** Manuel ve otomatik akışlar aynı yürütme ve
   rapor kurallarını paylaşır.
3. **Ölçmediğini iddia etme.** Arayüzdeki her sayı gerçek bir kaynağa dayanır.
4. **Yoğunluğu düzenle, gizleme.** Profesyonel çalışma yüzeyi gerekli bilgiyi
   azaltmaz; hiyerarşi ve tutarlılıkla okunur kılar.
5. **Kullanıcı sınırını sunucuda koru.** Sahiplik, kota ve doğrulama istemciye
   bırakılmaz.

## Accessibility & Inclusion

Temel hedef WCAG 2.1 AA'dır. Tüm işlevler klavyeyle erişilebilir olmalı;
modaller odağı korumalı ve kapandığında geri vermeli; kontroller programatik
etiket taşımalı; yalnızca renkle anlam aktarılmamalı; hareket azaltma tercihi
işlevsel durum değişimlerini yok etmeden karşılanmalıdır.

## Anti-references

- Neon-mor gradyanlı ve kazanç vaat eden kripto borsası dili.
- Genel SaaS şablonu: kart içinde kart, dekoratif ikon kutuları ve her başlığın
  üstünde etiket.
- Yeşilin birincil eylem rengi olarak kullanılması; REPLAY'de yeşil kâr/alış,
  kırmızı zarar/satış anlamını korur.
