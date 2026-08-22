"""
Canlı performans izleyici — ayrı bir terminalde çalışır.

    python scripts/perf_log.py            # canlı izle
    python scripts/perf_log.py --tail 50  # son 50 kaydı da göster
    python scripts/perf_log.py --ozet     # izlemeden, birikmiş kaydın özeti
    python scripts/perf_log.py --min-ms 500   # yalnızca 500ms'yi aşanlar

Backend her isteği `backend/storage/logs/perf.jsonl` dosyasına yazıyor
(bkz. `app/core/perf.py`); bu script o dosyayı takip edip okunur hale getirir.

**Neden ayrı bir script:** grafik tek istekle yüklenmiyor. Önce hızlı bir
pencere geliyor, 1,2 saniye sonra arkaplanda geçmiş derinleştirmesi. Uvicorn
terminalinde bu iki satır alakasız log'ların arasında kayboluyordu; burada
aynı yüklemenin fazları arka arkaya ve aralarındaki boşlukla birlikte
görünüyor.

Ayrıca her satır süreyi NEYİN harcadığını söylüyor: sağlayıcıya (Yahoo/Binance)
çıkıldıysa kaç kez ve kaç ms, yoksa önbellekten mi geldi. "2,5 saniye" cevabı
genelde tek bir sağlayıcı isteğidir ve bu ayrımı görmeden optimize edilecek
yer bulunamıyor.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from collections import defaultdict

# Windows konsolu varsayılan olarak cp1254 kullanıyor ve Türkçe karakterler
# (ş, ğ, ı) ile çizgi karakterleri `UnicodeEncodeError` fırlatıyordu — üstelik
# hata satırın ortasında patlıyor, çıktı yarım kalıyordu. UTF-8'e geçilir;
# geçilemezse `errors="replace"` en azından çökmeyi engeller.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Çizgi/ayırıcı karakterleri: konsol UTF-8 kaldırabiliyorsa kutu çizgisi,
# aksi halde ASCII. Kozmetik bir tercih için çıktı kaybetmeye değmez.
_UTF8 = (getattr(sys.stdout, "encoding", "") or "").lower().replace("-", "") == "utf8"
RULE = "─" if _UTF8 else "-"
DOT = "·" if _UTF8 else "."

# Yalnızca gerçek bir terminalde renk kullan (çıktı dosyaya yönlendirilirse
# kaçış dizileri okunmaz hale gelirdi).
_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def _c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


DIM = "2"
BOLD = "1"
RED = "31"
YELLOW = "33"
GREEN = "32"
CYAN = "36"
MAGENTA = "35"

# Süre eşikleri: altı yeşil, arası sarı, üstü kırmızı.
FAST_MS = 300.0
SLOW_MS = 1000.0

# İki istek arasında bu kadar boşluk varsa yeni bir "oturum" başlamış sayılır
# ve araya ayırıcı konur — böylece bir yüklemenin fazları görsel olarak
# birbirine yapışık kalır.
GAP_SECONDS = 3.0

DEFAULT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "backend", "storage", "logs", "perf.jsonl"
)


def _duration_color(ms: float) -> str:
    if ms >= SLOW_MS:
        return RED
    if ms >= FAST_MS:
        return YELLOW
    return GREEN


def format_entry(entry: dict) -> str:
    """Bir kaydı renkli tek satıra çevirir."""
    stamp = time.strftime("%H:%M:%S", time.localtime(entry["ts"]))
    ms = float(entry.get("ms", 0.0))

    label = entry.get("label", "?")
    detail = entry.get("detail") or ""
    line = [
        _c(stamp, DIM),
        "  ",
        _c(f"{label:<22}", CYAN),
        f"{detail:<28}",
        _c(f"{ms:>8.0f} ms", _duration_color(ms)),
    ]

    rows = entry.get("rows")
    line.append(_c(f"{rows:>7,} kayıt".replace(",", "."), DIM) if rows is not None else " " * 14)

    # Süreyi neyin harcadığı — asıl cevap burada.
    parts = []
    if entry.get("provider_calls"):
        share = (entry.get("provider_ms", 0.0) / ms * 100.0) if ms > 0 else 0.0
        parts.append(
            _c(
                f"sağlayıcı {entry['provider_ms']:.0f}ms ×{entry['provider_calls']} (%{share:.0f})",
                MAGENTA,
            )
        )
    if entry.get("ram_hits"):
        parts.append(_c(f"RAM ×{entry['ram_hits']}", DIM))
    if entry.get("disk_hits"):
        parts.append(_c(f"disk ×{entry['disk_hits']}", DIM))
    if parts:
        line.append("  " + ", ".join(parts))

    status = entry.get("status", 200)
    if status >= 400:
        line.append(_c(f"  [HTTP {status}]", RED))
    for note in entry.get("notes", []):
        line.append(_c(f"  ({note})", DIM))

    return "".join(line)


def _read_one(path: str) -> list[dict]:
    """Tek bir dosyayı okur; bozuk satırlar atlanır."""
    if not os.path.exists(path):
        return []
    entries = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                # Tail sırasında yarım yazılmış son satıra denk gelinebilir.
                continue
    return entries


def read_entries(path: str, include_backup: bool = True) -> list[dict]:
    """Kayıtları kronolojik sırada okur — devredilmiş yedek de dahil.

    Backend dosya belli bir boyutu aşınca devrediyor (`perf.jsonl` → `.1`).
    Yalnızca güncel dosyayı okumak, devretmenin hemen ardından çalıştırılan
    bir `--ozet`'in neredeyse boş çıkması demekti; yedek daha ESKİ olduğu için
    önce okunur.
    """
    entries = _read_one(path + ".1") if include_backup else []
    entries.extend(_read_one(path))
    return entries


def print_summary(entries: list[dict]) -> None:
    """Uç bazında toplam tablo: nerede zaman harcanıyor?"""
    if not entries:
        print("Kayıt yok.")
        return

    grouped: dict[str, list[dict]] = defaultdict(list)
    for entry in entries:
        grouped[entry.get("label", "?")].append(entry)

    print()
    print(_c(f"{'İşlem':<24}{'adet':>6}{'medyan':>10}{'en kötü':>10}{'sağlayıcı payı':>16}", BOLD))
    print(_c(RULE * 66, DIM))

    rows = []
    for label, items in grouped.items():
        durations = [float(i.get("ms", 0)) for i in items]
        provider_ms = sum(float(i.get("provider_ms", 0)) for i in items)
        total_ms = sum(durations) or 1.0
        rows.append((
            statistics.median(durations),
            label,
            len(items),
            statistics.median(durations),
            max(durations),
            provider_ms / total_ms * 100.0,
        ))

    # En yavaştan sıralanır: optimize edilecek yer listenin başındadır.
    for _, label, count, median, worst, share in sorted(rows, reverse=True):
        print(
            f"{label:<24}{count:>6}"
            + _c(f"{median:>9.0f}ms", _duration_color(median))
            + _c(f"{worst:>9.0f}ms", _duration_color(worst))
            + _c(f"{share:>15.0f}%", MAGENTA)
        )

    total = sum(float(e.get("ms", 0)) for e in entries)
    provider = sum(float(e.get("provider_ms", 0)) for e in entries)
    print(_c(RULE * 66, DIM))
    print(
        f"{'TOPLAM':<24}{len(entries):>6}{total / 1000:>9.1f}s"
        + _c(f"   sağlayıcıda geçen: {provider / 1000:.1f}s (%{provider / (total or 1) * 100:.0f})", MAGENTA)
    )
    print()


def follow(path: str, min_ms: float, tail: int) -> None:
    """Dosyayı canlı takip eder (`tail -f` gibi)."""
    print(_c(f"İzleniyor: {os.path.abspath(path)}", DIM))
    print(_c("Çıkmak için Ctrl+C. Backend çalışmıyorsa dosya oluşana kadar bekler.", DIM))
    print()

    # Başlangıçta son N kaydı göster, sonra yalnızca yenilerini.
    existing = read_entries(path)
    if tail and existing:
        for entry in existing[-tail:]:
            if float(entry.get("ms", 0)) >= min_ms:
                print(format_entry(entry))
        print(_c(RULE * 66 + "  (buradan itibaren canlı)", DIM))

    position = os.path.getsize(path) if os.path.exists(path) else 0
    last_ts = existing[-1]["ts"] if existing else 0.0

    while True:
        try:
            if not os.path.exists(path):
                time.sleep(0.4)
                continue

            size = os.path.getsize(path)
            if size < position:
                # Dosya devredilmiş (`.1` oldu) ya da silinmiş: yeni dosyayı
                # baştan oku, aksi halde okuma imleci dosyanın sonunda kalır
                # ve hiçbir yeni satır görünmezdi.
                position = 0
            if size == position:
                time.sleep(0.25)
                continue

            with open(path, "r", encoding="utf-8") as handle:
                handle.seek(position)
                chunk = handle.read()
                position = handle.tell()

            for line in chunk.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if float(entry.get("ms", 0)) < min_ms:
                    continue

                # Aradaki boşluk büyükse yeni bir yükleme başlamış demektir;
                # ayırıcı, bir grafiğin fazlarını görsel olarak bir arada tutar.
                gap = entry["ts"] - last_ts
                if last_ts and gap > GAP_SECONDS:
                    print(_c(f"{'':{DOT}<66} +{gap:.0f}s", DIM))
                last_ts = entry["ts"]

                print(format_entry(entry))

        except KeyboardInterrupt:
            raise
        except Exception as exc:  # noqa: BLE001 - izleyici hiçbir şeyde çökmemeli
            print(_c(f"(izleyici hatası, devam ediliyor: {exc})", RED))
            time.sleep(1.0)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="REPLAY performans logu izleyici",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--path", default=DEFAULT_PATH, help="perf.jsonl yolu")
    parser.add_argument("--tail", type=int, default=15, help="başlangıçta gösterilecek son kayıt sayısı")
    parser.add_argument("--min-ms", type=float, default=0.0, help="bu süreden hızlı istekleri gizle")
    parser.add_argument("--ozet", action="store_true", help="izleme, yalnızca özet tablo yazdır")
    parser.add_argument("--temizle", action="store_true", help="log dosyasını sil ve çık")
    args = parser.parse_args()

    path = os.path.abspath(args.path)

    if args.temizle:
        removed = []
        # Yedek de silinir: yalnızca güncel dosyayı silmek, bir sonraki
        # `--ozet`'te devredilmiş eski kayıtların geri gelmesi demekti.
        for target in (path, path + ".1"):
            if os.path.exists(target):
                os.remove(target)
                removed.append(os.path.basename(target))
        print(f"Silindi: {', '.join(removed)}" if removed else "Zaten temiz.")
        return

    if args.ozet:
        print_summary([e for e in read_entries(path) if float(e.get("ms", 0)) >= args.min_ms])
        return

    try:
        follow(path, min_ms=args.min_ms, tail=args.tail)
    except KeyboardInterrupt:
        print()
        print_summary(read_entries(path))


if __name__ == "__main__":
    main()
