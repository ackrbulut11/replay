"""
Trade Journal REST API uçları.

Tüm uçlar giriş gerektirir ve yalnızca isteği yapan kullanıcının kendi
işlemlerine erişir. İş mantığı `journal/trade_journal.py` içindedir
(RULES.md #9: route dosyasına iş mantığı yazılmaz).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.data.loader import loader as shared_loader, lookback_start_for_bars
from app.database.models import JournalTrade, User
from app.database.postgres import get_db
from app.engines.execution import ExecutionCosts
from app.engines.comparison import (
    ComparisonWindowError,
    build_comparison,
    manual_trades_payload,
    session_window,
)
from app.engines.strategy_engine import (
    DEFAULT_STARTING_BALANCE,
    MultiTimeframeDataError,
    StrategyEngine,
)
from app.journal.models import (
    PerformanceResponse,
    ReplaySessionCreateRequest,
    ReplaySessionResponse,
    TradeAdvanceRequest,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeResponse,
    TradeStatus,
    TradeUpdateRequest,
)
from app.journal.trade_journal import TradeJournal
from app.reports.performance_report import calculate_performance

router = APIRouter(prefix="/journal", tags=["journal"])
_journal = TradeJournal()
# Karşılaştırma, stratejiyi aynı pencerede çalıştırmak için bunlara ihtiyaç
# duyar; ikisi de durum tutmaz ve kendi önbelleklerine sahiptir.
_strategy_engine = StrategyEngine()
# Paylasilan tek ornek: her route kendi DataLoader()'ini yaratinca RAM
# onbellegi kopyalaniyor ve parquet kilitleri ayri ayri calisip ise
# yaramiyordu (bkz. data/loader.py sonundaki not).
_loader = shared_loader


def get_owned_trade(
    trade_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JournalTrade:
    """
    Yol parametresindeki işlemi yalnızca sahibi için döndürür.

    Sahibi olmayan bir istek 403 değil 404 alır: 403, başkasına ait bir
    işlemin var olduğunu sızdırırdı (strateji ve alarmlarla aynı desen).
    """
    trade = _journal.get_trade(db, trade_id, current_user.id)
    if trade is None:
        raise HTTPException(status_code=404, detail=f"İşlem bulunamadı: {trade_id}")
    return trade


# NOT: /performance, /{trade_id}'den ÖNCE tanımlanmalı — aksi halde yol
# parametresi bu ucu yutar ve "performance" bir trade_id sanılır.
@router.get("/performance", response_model=PerformanceResponse)
def get_performance(
    symbol: Optional[str] = Query(None, description="Sembol filtresi"),
    session_id: Optional[str] = Query(None, description="Replay oturumu filtresi"),
    include_saved: bool = Query(
        False,
        description="session_id ile birlikte: kalıcı kaydedilmiş işlemleri de dahil et",
    ),
    starting_balance: float = Query(10000.0, gt=0, description="Başlangıç bakiyesi"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Kapanmış işlemlerden performans raporu üretir.

    Win Rate, Loss Rate, Profit Factor, Sharpe, Max Drawdown, Net Profit ve
    equity curve döner. Açık pozisyonlar rapora dahil edilmez.
    """
    return _journal.performance(
        db,
        current_user.id,
        symbol=symbol,
        session_id=session_id,
        include_saved=include_saved,
        starting_balance=starting_balance,
    )


@router.get("/trades", response_model=list[TradeResponse])
def list_trades(
    symbol: Optional[str] = Query(None, description="Sembol filtresi"),
    status: Optional[str] = Query(None, description="Durum filtresi (OPEN, CLOSED)"),
    session_id: Optional[str] = Query(None, description="Replay oturumu filtresi"),
    include_saved: bool = Query(
        False,
        description="session_id ile birlikte: kalıcı kaydedilmiş işlemleri de getir",
    ),
    limit: int = Query(200, gt=0, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Giriş yapan kullanıcının işlemlerini listeler (en yeni önce)."""
    return _journal.list_trades(
        db,
        current_user.id,
        symbol=symbol,
        status=status,
        session_id=session_id,
        include_saved=include_saved,
        limit=limit,
    )


@router.post("/sessions", response_model=ReplaySessionResponse, status_code=201)
def start_session(
    request: ReplaySessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yeni bir replay oturumu başlatır; manuel işlemler bu oturuma bağlanır."""
    return _journal.start_session(db, request, user_id=current_user.id)


@router.get("/sessions/{session_id}", response_model=ReplaySessionResponse)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Oturumun güncel durumunu (bakiye dahil) döndürür — yalnızca sahibi.

    Sahibi olmayan istek 403 değil 404 alır (strateji/alarm ile aynı desen).
    """
    session = _journal.get_session(db, session_id, user_id=current_user.id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Oturum bulunamadı: {session_id}")
    return session


@router.post("/sessions/{session_id}/save")
def save_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Oturumun işlemlerini kalıcı olarak işaretler.

    Bundan sonra aynı paritede açılan replay oturumlarında da görünürler.
    Sahiplik sorguda filtrelendiği için başkasının oturumu için `saved: 0`
    döner — var olup olmadığı sızmaz.
    """
    saved = _journal.save_session(db, session_id, user_id=current_user.id)
    return {"session_id": session_id, "saved": saved}


@router.post("/trades", response_model=TradeResponse, status_code=201)
def open_trade(
    request: TradeOpenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replay sırasında yeni bir pozisyon açar."""
    try:
        return _journal.open_trade(db, request, user_id=current_user.id)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/trades/{trade_id}", response_model=TradeResponse)
def get_trade(trade: JournalTrade = Depends(get_owned_trade)):
    """İşlem detayını döndürür (yalnızca sahibi)."""
    return trade


@router.post("/trades/{trade_id}/close", response_model=TradeResponse)
def close_trade(
    request: TradeCloseRequest,
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """Açık pozisyonu kapatır ve kâr/zararını hesaplar."""
    try:
        return _journal.close_trade(db, trade, request)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/trades/{trade_id}/advance", response_model=TradeResponse)
def advance_trade(
    request: TradeAdvanceRequest,
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """Replay ilerledi: verilen mumlarda stop-loss/take-profit tetiklendi mi?

    Tetiklendiyse pozisyon kapatılıp kapanmış işlem döner, tetiklenmediyse
    işlem olduğu gibi. Zaten kapalı bir işlem için de güvenle çağrılabilir
    (idempotent), böylece istemci yarış durumlarını ayrıca ele almak zorunda
    kalmaz.

    Tetikleme kararı ve çıkış fiyatı `engines/replay_engine` içindedir; route
    iş mantığı taşımaz (RULES.md #9) ve finansal hesap arayüze yazılmaz.
    """
    try:
        return _journal.advance(db, trade, request.bars)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/trades/{trade_id}", response_model=TradeResponse)
def update_trade(
    request: TradeUpdateRequest,
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """Not, sebep, ekran görüntüsü ve (açık pozisyonda) seviyeleri günceller."""
    try:
        return _journal.update_trade(db, trade, request)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/trades/{trade_id}", status_code=204)
def delete_trade(
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """İşlemi siler."""
    _journal.delete_trade(db, trade)


class SessionComparisonRequest(BaseModel):
    """Manuel oturumu bir stratejiyle karşılaştırma isteği."""

    strategy_id: str = Field(..., description="Karşılaştırılacak stratejinin kimliği")
    provider: Optional[str] = Field(
        None, description="Verilmezse oturumun işlemlerinden okunur"
    )
    starting_balance: Optional[float] = Field(
        None, gt=0, description="Verilmezse oturumun kendi başlangıç bakiyesi kullanılır"
    )


@router.post("/sessions/{session_id}/compare")
def compare_session_with_strategy(
    session_id: str,
    request: SessionComparisonRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manuel replay oturumunu bir stratejiyle AYNI PENCEREDE karşılaştırır.

    "Elle 12 işlem yaptın, %8 kazandın; aynı dönemde stratejin 7 işlemle %14
    kazanırdı" sorusunun cevabı. İki motor da vardı ama hiçbir yerde yan yana
    konmuyordu (bkz. engines/comparison.py).

    Strateji, oturumun ilk girişinden son çıkışına kadar olan aralıkta
    çalıştırılır ve iki taraf da aynı performans raporundan, aynı başlangıç
    bakiyesiyle geçer.
    """
    session = _journal.get_session(db, session_id, user_id=current_user.id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Oturum bulunamadı: {session_id}")

    strategy = _strategy_engine.get_strategy(db, request.strategy_id, current_user.id)
    if strategy is None:
        # Strateji sahiplik kapısı: 403 değil 404 (varlık sızmasın).
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {request.strategy_id}")

    trades = _journal.list_trades(
        db, current_user.id, session_id=session_id, status=TradeStatus.CLOSED.value, limit=1000
    )
    if not trades:
        raise HTTPException(
            status_code=400,
            detail="Bu oturumda kapanmış işlem yok; karşılaştırılacak bir sonuç bulunmuyor.",
        )

    try:
        window = session_window(trades)
    except ComparisonWindowError as e:
        raise HTTPException(status_code=400, detail=str(e))

    starting_balance = (
        request.starting_balance or session.starting_balance or DEFAULT_STARTING_BALANCE
    )
    provider = request.provider or trades[0].provider or "binance"
    symbol = session.symbol
    timeframe = session.timeframe or trades[0].timeframe or "1h"

    # Manuel taraf: oturumun kendi işlemleri — ama STRATEJİNİN maliyetleriyle.
    # Günlük kayıtları maliyetsiz tutuluyor, strateji şablonları ise 10 bps
    # komisyon + 5 bps slipajla geliyor; aynı maliyeti iki tarafa da uygulamadan
    # fark stratejiden değil varsayımdan gelirdi. Kayıtlar değiştirilmez,
    # yalnızca karşılaştırma kopyası maliyetlendirilir.
    manual_report = calculate_performance(
        manual_trades_payload(trades, ExecutionCosts.from_strategy(strategy)),
        starting_balance=starting_balance,
    )

    # Strateji tarafı: AYNI pencere, aynı sembol ve zaman dilimi.
    try:
        df = _loader.load_data(
            provider_name=provider,
            symbol=symbol,
            timeframe=timeframe,
            # Isınma payı: göstergelerin pencerenin başında hazır olması için
            # geriye doğru fazladan veri istenir, değerlendirme yine pencerede.
            start_time=lookback_start_for_bars(window[0], timeframe, 300),
            end_time=window[1],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Piyasa verisi yüklenemedi: {e}")

    if df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"{symbol} için bu aralıkta veri bulunamadı ({window[0].date()} - {window[1].date()}).",
        )

    try:
        multi_tf_data = _strategy_engine.load_multi_tf_data(
            strategy=strategy, provider=provider, symbol=symbol,
            loader=_loader, start_dt=window[0], end_dt=window[1],
        )
    except MultiTimeframeDataError as e:
        raise HTTPException(status_code=502, detail=str(e))

    try:
        strategy_result = _strategy_engine.evaluate(
            strategy=strategy,
            df=df,
            multi_tf_data=multi_tf_data or None,
            starting_balance=starting_balance,
            # `df` ısınma için 300 bar geriden başlıyor ama DEĞERLENDİRME
            # oturumun kendi penceresinde yapılmalı. Bunsuz strateji, manuel
            # oturum başlamadan ~280 bar önce alım satım yapıyordu ve "aynı
            # pencere" iddiası gerçek değildi.
            eval_start=window[0],
            eval_end=window[1],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return build_comparison(
        manual_report=manual_report,
        strategy_result=strategy_result,
        symbol=symbol,
        timeframe=timeframe,
        window=window,
    )
