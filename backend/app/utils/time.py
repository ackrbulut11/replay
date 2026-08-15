"""
Zaman yardımcıları.

Piyasa verisiyle çalışan her yerde "şimdi" UTC olmalıdır: sağlayıcıların
(Binance, Yahoo Finance) döndürdüğü zaman damgaları UTC'dir ve parquet
önbelleğine de öyle yazılır. `datetime.now()` ise sürecin YEREL saatini verir.

İkisi karıştırıldığında hata üretmez, sessizce yanlış davranır: Türkiye'de
(UTC+3) geliştirirken `needed_end` her zaman üç saat ileride görünür, bu da
`load_data`'daki 15 dakikalık tazelik eşiğini her istekte aştırıp gereksiz
sağlayıcı çağrısı yaptırır. Render UTC çalıştığı için canlıda görünmez —
"yerelde yavaş, canlıda normal" sınıfından bir hata.

Timezone bilgisi taşımayan (naive) UTC döndürülür: karşılaştırıldığı pandas
zaman damgaları da naive'dir ve aware/naive karışımı doğrudan TypeError verir.
"""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Şu anki UTC zamanı — timezone bilgisi taşımayan (naive) biçimde."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
