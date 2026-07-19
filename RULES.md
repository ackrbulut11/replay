# RULES.md — Trading Research Platform

Bu dosya, bu proje üzerinde çalışan AI ajanlarının ve geliştiricilerin uyması gereken kuralları tanımlar.

## Mimari Kuralları

1. **Modülerlik zorunlu.** Her modül (`chart`, `replay`, `rules`, `scanner`, `journal`, `providers` vb.) bağımsız çalışabilmeli. Bir modülü silmek diğerlerini kırmamalı.
2. **Strateji motoru grafikten bağımsızdır.** `backend/app/rules/` ve `engines/` içindeki kod, hiçbir zaman frontend/chart tarafına doğrudan bağımlı olamaz.
3. **Replay ve canlı analiz aynı veri akışını kullanır.** İki ayrı veri işleme mantığı yazılmaz; tek bir engine, farklı modlarda (`live`, `replay`) çalışır.
4. **Stratejiler kod değil, veridir.** Yeni strateji eklemek için `.py` dosyası açılmaz. Stratejiler `storage/strategies/*.json` içinde saklanır ve `rules/engine.py` tarafından yorumlanır.
5. **Veri sağlayıcılar `IDataProvider` interface'ini uygular.** Yeni bir borsa/piyasa eklemek sadece yeni bir `providers/*.py` dosyası yazmayı gerektirmeli; başka hiçbir yer değişmemeli.
6. **UI, veri katmanı ve strateji motoru birbirinden bağımsızdır.** Frontend sadece API/WebSocket üzerinden konuşur, backend iç mantığını bilmez.

## Kod Kuralları

7. **Büyük özellik = küçük parçalar.** Bir PR/görev tek bir modülü (örn. sadece `journal/`) hedeflemeli, birden fazla katmana aynı anda dokunmamalı.
8. **Kod tekrarı yasak.** Ortak mantık (örn. gösterge hesaplama) `indicators/` veya `utils/` altında merkezi tutulur.
9. **Yeni endpoint eklerken:** route → `api/routes/`, iş mantığı → ilgili `engines/` veya modül klasörü. Route dosyasına iş mantığı yazılmaz.
10. **Tip güvenliği:** Backend'de Pydantic modelleri, frontend'de TypeScript tipleri zorunlu. `any` / şema dışı JSON kullanımı yasak.
11. **Migration olmadan veritabanı şeması değiştirilmez.** `database/migrations/` altına migration eklenmeden `models.py` değiştirilmez.

## Geliştirme Sırası

12. **Faz sırası korunur.** Roadmap'teki fazlar (MVP → Strateji Motoru → Scanner → Backtest → Gelişmiş Analiz → AI) atlanmadan ilerlenir; bir sonraki faza geçmeden önceki faz çalışır durumda olmalı.
13. **Önce çalışan, sonra mükemmel.** Erken optimizasyon yapılmaz; doğru mimari > performans ince ayarı.
14. **Her faz sonunda kullanılabilir bir çıktı olmalı.** Yarım kalan özellik ana branch'e girmez.

## AI Ajan Kuralları

15. **Mimariyi AI değiştirmez.** AI, roadmap ve bu dosyada tanımlı yapıyı hızlandırmak için kullanılır; yeni klasör/katman eklemeden önce onay istenir.
16. **`directory-structure.md`'ye harfiyen uyulur.** Proje bu dosyada tanımlı dizin ağacına göre kurulur. Yeni dosya/klasör oluşturmadan önce mutlaka kontrol edilir; benzer bir modül varsa oraya eklenir. Dizin yapısında değişiklik (yeni klasör, taşıma, yeniden adlandırma) gerekiyorsa önce `directory-structure.md` güncellenir, sonra kod yazılır — tam tersi olmaz.
17. **Dış API anahtarları koda yazılmaz.** Binance/Telegram vb. anahtarlar `.env` üzerinden okunur, `core/config.py` merkezi olarak yönetir.
18. **Test yazılmadan büyük mantık (rule engine, backtest engine, optimizer) tamamlanmış sayılmaz.**

## Backtest Bütünlüğü — Lookahead Bias

19. **Backtest engine lookahead bias'a izin vermez.** Değerlendirme anında yalnızca o ana kadar oluşmuş mumlara erişilebilir; gelecekteki hiçbir mum, doğrudan ya da dolaylı olarak strateji/rule engine'e sızdırılamaz.
20. **`df.shift(-1)` ve benzeri "geleceğe bakan" kaydırma işlemleri yasaktır.** Gösterge/kural hesaplamalarında sadece `shift(1)` veya daha negatif olmayan (geçmişe dönük) kaydırmalar kullanılabilir.
21. **Replay ve backtest, veriyi mum mum (bar-by-bar) işler.** Tüm dataframe'i baştan sona vektörize hesaplayıp sonradan "geçmişe gitmiş gibi" okumak yasaktır; hesaplama, o ana kadar açığa çıkmış veriyle sınırlı bir pencere/state üzerinden yapılır.
22. **Sinyal, kapanan mumdan üretilir; işlem bir sonraki mumda açılır.** Aynı mumun kapanışını görüp yine aynı mumda pozisyon açmak (aynı bar execution) varsayılan olarak yasaktır; açıkça "intrabar" test edilmediği sürece bir bar gecikme (bar delay) uygulanır.
23. **Optimizer ve Walk Forward testlerinde de aynı kural geçerlidir.** Parametre taraması yaparken test edilen dönemin dışındaki (gelecekteki) veriyle "en iyi" parametrenin seçilmesi lookahead bias'tır ve yasaktır.

## Veri Saklama — Mum Limiti

24. **Ham veri sınırsız tutulmaz.** Her sembol + zaman dilimi kombinasyonu için saklanacak maksimum mum sayısı sabittir (örn. son N mum); 10 yıllık veriyi 1 dakikalık çözünürlükte tutmak yasaktır.
25. **Zaman dilimi başına ayrı retention limiti tanımlanır**, çözünürlük arttıkça saklanan geçmiş kısalır:

   | Zaman Dilimi | Yaklaşık Saklama Aralığı |
   |---|---|
   | 1m / 5m / 15m | son birkaç ay |
   | 1H / 4H | son 1–2 yıl |
   | 1D | son 5–10 yıl |
   | 1W / 1M | tüm geçmiş |

   (Kesin sayılar `core/config.py` üzerinden merkezi ve değiştirilebilir olmalı, koda gömülmemeli.)
26. **Düşük zaman dilimleri istenirse yüksek zaman diliminden türetilmez ama tersi doğrudur.** 1D veriden 1H üretilemez (bilgi kaybı), ama gerektiğinde 1m'den 1H/4H/1D resample edilip cache'lenebilir — ham 1m veri yine de retention limitine tabidir.
27. **Eski mumlar retention limitini aştığında otomatik temizlenir** (`scripts/update_market.py` içinde periyodik pruning), disk/DB büyümesi sınırsız olamaz.

## Yasaklar

- ❌ Chart/UI tarafına finansal hesaplama mantığı yazmak
- ❌ Strateji için yeni `.py` dosyası açmak
- ❌ Docker/production altyapısı eklemek (bu bir masaüstü uygulaması, sunucu değil)
- ❌ Tek commit'te birden fazla fazı aynı anda geliştirmek
- ❌ Onaysız üçüncü parti kütüphane/servis entegrasyonu eklemek
- ❌ `shift(-1)` veya benzeri şekilde gelecekteki mumu değerlendirmeye dahil etmek (lookahead bias)
- ❌ Herhangi bir sembol + zaman dilimi için retention limiti olmadan sınırsız ham veri biriktirmek