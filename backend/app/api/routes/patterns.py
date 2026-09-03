"""
Örüntü arama uçları (Faz 3.5).

Bir koşul ağacının geçmişte doğru olduğu bar aralıklarını döndürür. Strateji
değerlendirmesinden farkı iş mantığında değil SORUDA: burada pozisyon, çıkış
kuralı ve kâr/zarar yoktur — bkz. `engines/pattern_engine.py`.

RULES.md §9 gereği route iş mantığı taşımaz: doğrulama `rules/validation.py`'a,
arama `engines/pattern_engine.py`'a, veri yükleme `data/loader.py`'a aittir.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, Literal
from threading import BoundedSemaphore

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.core.security import RateLimiter
from app.utils.time import utc_now
from app.data.loader import loader as shared_loader, lookback_start_for_bars
from app.database.models import User
from app.engines import pattern_engine
from app.rules.validation import validate_condition_group

router = APIRouter(prefix="/patterns", tags=["Patterns"])

# Paylasilan tek ornek (bkz. data/loader.py sonundaki not).
loader = shared_loader

# Tek aramada taranacak en fazla bar. Üst sınır olmadan "tüm veri" seçen bir
# kullanıcı on yıllık 1 dakikalık seriyi (milyonlarca bar) taratabilirdi.
MAX_LIMIT_BARS = 20000
DEFAULT_LIMIT_BARS = 2000


class PatternSearchRequest(BaseModel):
    provider: Literal["binance", "bist", "nasdaq", "forex"]
    symbol: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9.^=_/-]+$")
    timeframe: Literal["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"]
    # Strateji kuralıyla birebir aynı DSL: {logic, conditions}
    condition_group: dict[str, Any]
    parameters: Optional[list[dict[str, Any]]] = Field(default=None, max_length=64)
    start: Optional[str] = None
    end: Optional[str] = None
    limit_bars: int = Field(default=DEFAULT_LIMIT_BARS, ge=0, le=MAX_LIMIT_BARS)


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=422, detail=f"Geçersiz tarih formatı (YYYY-MM-DD): {value}"
        )


def _resolve_range(request: "PatternSearchRequest") -> tuple[datetime, datetime]:
    """Tarama penceresini tarihe çevirir.

    `DataLoader.load_data` `None` kabul etmiyor (bkz. loader.py `has_start_covered`),
    bu yüzden aralık burada türetilir — strateji değerlendirmesindeki mantığın
    aynısı, `lookback_start_for_bars` ile: 2000 mumluk bir istek için yıllarca
    veri çekmek, sayfa başına 1000 mum dönen sağlayıcılarda taramayı
    dakikalara çıkarıyordu.
    """
    end_dt = _parse_date(request.end) or utc_now()
    start_dt = _parse_date(request.start)
    bounded_start = lookback_start_for_bars(end_dt, request.timeframe, MAX_LIMIT_BARS)

    if start_dt is None:
        start_dt = lookback_start_for_bars(
            end_dt, request.timeframe, request.limit_bars or MAX_LIMIT_BARS
        )
    else:
        # Sağlayıcıdan indirilen veri de hesaplanan veri kadar sınırlı kalır.
        start_dt = max(start_dt, bounded_start)

    if start_dt >= end_dt:
        raise HTTPException(status_code=422, detail="Başlangıç bitişten önce olmalı")
    return start_dt, end_dt


def _params_from_list(parameters: Optional[list[dict[str, Any]]]) -> dict[str, Any]:
    """Strateji parametre listesini `{ad: değer}` sözlüğüne çevirir.

    Koşulda `"$rsi_esigi"` gibi referanslar bu sözlükten çözülür
    (bkz. `resolve_parameter`).
    """
    result: dict[str, Any] = {}
    for param in parameters or []:
        name = param.get("name")
        if name:
            result[name] = param.get("default", param.get("value"))
    return result


_search_rate = RateLimiter(10, 60)
_search_slots = BoundedSemaphore(2)


def _search_user(current_user: User = Depends(get_current_user)):
    """Pahalı taramalar için kullanıcı ve süreç düzeyinde sınır uygular."""
    _search_rate.check(current_user.id)
    if not _search_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Tarama kapasitesi dolu; biraz sonra deneyin")
    try:
        yield current_user
    finally:
        _search_slots.release()


@router.post("/search")
def search_patterns(
    request: PatternSearchRequest,
    current_user: User = Depends(_search_user),
) -> dict:
    """
    Koşulun doğru olduğu geçmiş bar aralıklarını bulur.

    Kaydedilmiş bir strateji GEREKMEZ: kullanıcı bir fikri kurala çevirmeden
    önce "bu durum kaç kez oldu?" diye sorabilsin diye koşul doğrudan gövdede
    taşınır. Bu yüzden sahiplik kapısı da yok — kaydedilmiş bir kayda
    dokunulmuyor, yalnızca piyasa verisi okunuyor (ve o zaten giriş istiyor).
    """
    errors = validate_condition_group(
        request.condition_group,
        parameters=request.parameters,
        field_name="Koşul",
    )
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    start_dt, end_dt = _resolve_range(request)

    df = loader.load_data(
        provider_name=request.provider,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start_time=start_dt,
        end_time=end_dt,
    )

    if df is None or df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"{request.symbol} için {request.timeframe} verisi bulunamadı.",
        )

    limit = request.limit_bars or MAX_LIMIT_BARS
    if len(df) > limit:
        df = df.tail(limit).reset_index(drop=True)

    result = pattern_engine.search(
        df=df,
        condition_group=request.condition_group,
        params=_params_from_list(request.parameters),
    )

    return {
        "symbol": request.symbol,
        "provider": request.provider,
        "timeframe": request.timeframe,
        "total_bars": len(df),
        **result,
    }
