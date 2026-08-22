"""
İstek başına performans ölçümü — "bu tık neden bu kadar sürdü?"

Grafik tek bir istekle yüklenmiyor: önce hızlı bir pencere (`bars_before=1500`),
1,2 sn sonra arkaplanda geçmiş derinleştirme (`bars_before=5000`). Kullanıcı
"bir kısmı hemen geldi, kalanı saniyeler sonra" derken tam olarak bunu
görüyor. Ama hangi fazın ne kadar sürdüğü ve süreyi NEYİN harcadığı
(önbellek mi, sağlayıcıya çıkmak mı) hiçbir yerde görünmüyordu.

Bu modül üç şey yapar:

  1. Her isteği süre ölçer ve **insan tarafından okunabilir bir etiket**
     verir ("ilk pencere", "geçmiş derinleştirme", "strateji çalıştırma").
     Ham `GET /api/market/window` satırı hangi faz olduğunu söylemiyordu.
  2. İstek boyunca veri katmanının ne yaptığını sayar: kaç kez önbellekten
     karşılandı, kaç kez sağlayıcıya (Yahoo/Binance) çıkıldı ve o çağrılar
     toplam ne kadar sürdü. Cevap genelde buradadır — 2,5 saniyenin 2,4'ü
     tek bir sağlayıcı isteğidir.
  3. Sonucu hem sürecin stdout'una hem satır satır bir JSONL dosyasına yazar.
     Dosya, ayrı bir terminalde canlı izleyiciyi (`scripts/perf_log.py`)
     besler; stdout ise zaten açık olan uvicorn penceresinde yeterlidir.

**Üretimde kendiliğinden kapalıdır** (bkz. `settings.perf_log_enabled`): her
istekte diske satır yazmak orada istenmez.

Ölçüm iş mantığına karışmaz — sayaçlar `contextvars` üzerinden taşınır, veri
katmanı yalnızca "şunu yaptım" diye haber verir. Ölçüm kapalıyken bu çağrılar
birkaç nanosaniyelik no-op olur.
"""

from __future__ import annotations

import json
import os
import sys
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

# Ölçülen isteğin kaydı. DEĞİŞTİRİLEBİLİR bir nesne tutulur ve contextvar
# yeniden atanmaz: FastAPI senkron endpoint'leri bir iş parçacığı havuzunda
# çalıştırıyor ve oraya bağlamın KOPYASI geçiyor. Kopya aynı nesneyi işaret
# ettiği için mutasyon görünür, yeniden atama görünmezdi.
_current: ContextVar[Optional["RequestPerf"]] = ContextVar("request_perf", default=None)


@dataclass
class RequestPerf:
    """Tek bir HTTP isteği boyunca biriken ölçümler."""

    started: float = field(default_factory=time.perf_counter)
    # Sağlayıcıya (Yahoo/Binance/TwelveData) çıkılan çağrılar.
    provider_calls: int = 0
    provider_seconds: float = 0.0
    # Önbellekten karşılanan okumalar: RAM (L1) ve parquet ayrı sayılır ki
    # "diske mi gitti, bellekten mi geldi" ayırt edilebilsin.
    ram_hits: int = 0
    disk_hits: int = 0
    # Yanıtta dönen kayıt sayısı (mum, sinyal, sembol...). Süreyi tek başına
    # okumak yanıltıcı: 2 sn'de 5.000 mum ile 2 sn'de 50 mum aynı şey değil.
    rows: Optional[int] = None
    # Endpoint'in kendi eklediği serbest notlar (ör. "en eskiye çekildi").
    notes: list[str] = field(default_factory=list)

    @property
    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.started) * 1000.0

    @property
    def provider_ms(self) -> float:
        return self.provider_seconds * 1000.0


# ─── Veri katmanının haber verme yüzeyi ──────────────────────────────────────
#
# Bu fonksiyonlar ölçüm kapalıyken hiçbir şey yapmaz; çağıran taraf koşul
# yazmak zorunda kalmasın diye böyle.


def note_provider_call(seconds: float) -> None:
    """Sağlayıcıya çıkılan bir çağrıyı ve süresini kaydeder."""
    record = _current.get()
    if record is None:
        return
    record.provider_calls += 1
    record.provider_seconds += seconds


def note_cache_hit(source: str) -> None:
    """Önbellekten karşılanan bir okumayı kaydeder (`"ram"` ya da `"disk"`)."""
    record = _current.get()
    if record is None:
        return
    if source == "ram":
        record.ram_hits += 1
    else:
        record.disk_hits += 1


def note_rows(count: int) -> None:
    """Yanıtta dönen kayıt sayısını bildirir."""
    record = _current.get()
    if record is not None:
        record.rows = count


def note(message: str) -> None:
    """İsteğe serbest bir açıklama iliştirir."""
    record = _current.get()
    if record is not None:
        record.notes.append(message)


class timed_provider_call:
    """Sağlayıcı çağrısını saran bağlam yöneticisi.

    `with timed_provider_call(): provider.fetch_ohlcv(...)` — hata fırlatsa
    bile süre kaydedilir, çünkü başarısız bir çağrı da kullanıcıyı bekletmiştir.
    """

    def __enter__(self):
        self._started = time.perf_counter()
        return self

    def __exit__(self, *_exc):
        note_provider_call(time.perf_counter() - self._started)
        return False


# ─── İstek etiketleme ────────────────────────────────────────────────────────


def describe(request: Request) -> tuple[str, str]:
    """İsteği `(etiket, ayrıntı)` olarak insan diline çevirir.

    Ham yol adı hangi FAZDA olduğumuzu söylemiyor: grafiğin ilk penceresi ile
    arkaplandaki geçmiş derinleştirmesi aynı uca (`/market/window`) gidiyor ve
    yalnızca `bars_before`/`bars_after` oranıyla ayrılıyorlar (bkz. App.tsx
    `handleLoadChart` ve `loadOlderWindowInBackground`).
    """
    path = request.url.path
    query = request.query_params
    symbol = query.get("symbol", "")
    timeframe = query.get("timeframe", "")
    detail = f"{symbol} {timeframe}".strip()

    if path.endswith("/market/window"):
        before = int(query.get("bars_before", 0) or 0)
        after = int(query.get("bars_after", 0) or 0)
        if before <= 1:
            return "ileri uzatma", f"{detail} +{after} mum"
        if after <= 1:
            return "geçmiş derinleştirme", f"{detail} -{before} mum"
        return "ilk pencere", f"{detail} -{before}/+{after} mum"

    if path.endswith("/market/data"):
        span = f"{query.get('start', '')}→{query.get('end', '')}".strip("→")
        return "tarih aralığı", f"{detail} {span}".strip()

    if path.endswith("/market/quotes"):
        items = query.get("items", "")
        return "fiyat tablosu", f"{len(items.split(',')) if items else 0} sembol"
    if path.endswith("/market/coverage"):
        return "önbellek kapsamı", detail
    if path.endswith("/market/search") or path.endswith("/market/symbols"):
        return "sembol arama", query.get("q", "")

    if "/strategy/" in path or path.endswith("/strategy"):
        if path.endswith("/evaluate"):
            return "strateji çalıştırma", detail
        if path.endswith("/batch-evaluate"):
            return "toplu tarama başlat", ""
        if "/scans" in path:
            return "tarama geçmişi", ""
        if path.endswith("/evaluations"):
            return "test geçmişi", ""
        if path.endswith("/templates"):
            return "şablonlar", ""
        if path.endswith("/indicators"):
            return "gösterge listesi", ""
        if path.endswith("/list"):
            return "strateji listesi", ""
        return "strateji", ""

    if "/journal/" in path:
        if path.endswith("/compare"):
            return "manuel↔strateji kıyas", ""
        if path.endswith("/advance"):
            return "stop/hedef kontrolü", ""
        if path.endswith("/performance"):
            return "performans raporu", ""
        return "işlem günlüğü", ""

    if "/patterns" in path:
        return "örüntü arama", detail
    if "/alerts" in path:
        return "alarm", detail
    if "/watchlist" in path:
        return "izleme listesi", ""
    if "/auth/" in path:
        return "kimlik", path.rsplit("/", 1)[-1]

    return path.replace("/api/", ""), detail


# ─── Middleware ──────────────────────────────────────────────────────────────

# Bu süreyi aşan istekler izleyicide vurgulanır — "yavaş"ın eşiği.
SLOW_MS = 1000.0


class PerfLoggingMiddleware(BaseHTTPMiddleware):
    """Her isteği süre ölçüp stdout'a ve JSONL dosyasına yazar."""

    def __init__(self, app, log_path: str):
        super().__init__(app)
        self.log_path = log_path
        os.makedirs(os.path.dirname(log_path), exist_ok=True)

    async def dispatch(self, request: Request, call_next):
        record = RequestPerf()
        token = _current.set(record)
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            _current.reset(token)
            try:
                self._emit(request, record, status)
            except Exception:
                # Ölçüm hiçbir koşulda isteği bozmamalı.
                pass

    def _emit(self, request: Request, record: RequestPerf, status: int) -> None:
        label, detail = describe(request)
        elapsed = record.elapsed_ms
        entry: dict[str, Any] = {
            "ts": time.time(),
            "method": request.method,
            "path": request.url.path,
            "label": label,
            "detail": detail,
            "status": status,
            "ms": round(elapsed, 1),
            "provider_calls": record.provider_calls,
            "provider_ms": round(record.provider_ms, 1),
            "ram_hits": record.ram_hits,
            "disk_hits": record.disk_hits,
            "rows": record.rows,
            "notes": record.notes,
        }

        with open(self.log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

        _safe_print(format_line(entry))


def _safe_print(line: str) -> None:
    """Konsolun karakter kümesi yetmese bile satırı kaybetmeden yazar.

    Windows konsolu varsayılan olarak cp1254; Türkçe karakterler ve `×` gibi
    işaretler `UnicodeEncodeError` fırlatıyor. Kozmetik bir karakter yüzünden
    ölçüm satırının tamamını kaybetmek istemiyoruz — asıl kayıt zaten JSONL
    dosyasında, burası yalnızca uvicorn penceresindeki hızlı bakış.
    """
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        print(line.encode(encoding, errors="replace").decode(encoding), flush=True)


def format_line(entry: dict[str, Any]) -> str:
    """Bir kaydı tek satırlık okunabilir metne çevirir (izleyici de bunu kullanır)."""
    stamp = time.strftime("%H:%M:%S", time.localtime(entry["ts"]))
    label = entry["label"]
    detail = entry.get("detail") or ""
    ms = entry["ms"]

    parts = [f"{stamp}  {label:<22}"]
    if detail:
        parts.append(f"{detail:<26}")
    else:
        parts.append(" " * 26)

    parts.append(f"{ms:>8.0f} ms")

    rows = entry.get("rows")
    if rows is not None:
        parts.append(f"{rows:>6} kayıt")
    else:
        parts.append(" " * 12)

    # Süreyi neyin harcadığı: asıl cevap genelde burada.
    breakdown = []
    if entry["provider_calls"]:
        breakdown.append(
            f"sağlayıcı {entry['provider_ms']:.0f}ms x{entry['provider_calls']}"
        )
    if entry["ram_hits"]:
        breakdown.append(f"RAM x{entry['ram_hits']}")
    if entry["disk_hits"]:
        breakdown.append(f"disk x{entry['disk_hits']}")
    if breakdown:
        parts.append("  " + ", ".join(breakdown))

    if entry["status"] >= 400:
        parts.append(f"  [HTTP {entry['status']}]")
    for note_text in entry.get("notes", []):
        parts.append(f"  ({note_text})")

    return "".join(parts)


def install(app, settings_obj=settings) -> Optional[str]:
    """Ölçüm açıksa middleware'i takar ve log dosyasının yolunu döndürür."""
    if not settings_obj.perf_log_enabled:
        return None
    path = settings_obj.perf_log_path
    app.add_middleware(PerfLoggingMiddleware, log_path=path)
    return path
