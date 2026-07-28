from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_admin
from app.database.models import Alert, Strategy, User, Watchlist
from app.database.postgres import get_db

# Tüm admin uçları ADMIN_EMAILS beyaz listesiyle korunur (router seviyesinde).
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])


class AdminUserItem(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    strategies_count: int = 0
    alerts_count: int = 0
    # Kullanıcının alarm kurduğu pariteler (tekrarsız, alfabetik)
    alert_symbols: List[str] = []
    # İzleme listelerindeki tekrarsız parite sayısı
    watchlist_count: int = 0

    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    total_users: int
    total_strategies: int
    total_alerts: int
    total_watchlist_symbols: int
    latest_users: List[AdminUserItem]


def _alert_summary(db: Session, user_ids: List[str]) -> dict[str, tuple[int, List[str]]]:
    """
    Kullanıcı başına (alarm sayısı, parite listesi) döndürür.

    Kullanıcı başına ayrı sorgu atmak yerine tek seferde gruplanır; kullanıcı
    sayısı arttıkça N+1 sorguya dönüşmesin.
    """
    if not user_ids:
        return {}

    rows = (
        db.query(Alert.user_id, Alert.symbol, func.count(Alert.id))
        .filter(Alert.user_id.in_(user_ids))
        .group_by(Alert.user_id, Alert.symbol)
        .all()
    )

    summary: dict[str, tuple[int, List[str]]] = {}
    for user_id, symbol, count in rows:
        total, symbols = summary.get(user_id, (0, []))
        summary[user_id] = (total + count, symbols + [symbol])

    return {uid: (total, sorted(set(symbols))) for uid, (total, symbols) in summary.items()}


def _strategy_counts(db: Session, user_ids: List[str]) -> dict[str, int]:
    """Kullanıcı başına strateji sayısı (tek sorguda)."""
    if not user_ids:
        return {}
    rows = (
        db.query(Strategy.user_id, func.count(Strategy.id))
        .filter(Strategy.user_id.in_(user_ids))
        .group_by(Strategy.user_id)
        .all()
    )
    return {user_id: count for user_id, count in rows}


def _count_watchlist_symbols(lists: Any) -> int:
    """
    Bir kullanıcının izleme listelerindeki tekrarsız parite sayısı.

    Listeler JSON kolonunda tutulduğu için sayım SQL yerine burada yapılır.
    Aynı sembol birden fazla listede olabilir; bir kez sayılır.
    """
    if not isinstance(lists, list):
        return 0

    symbols: set[str] = set()
    for group in lists:
        if not isinstance(group, dict):
            continue
        for item in group.get("items", []) or []:
            if isinstance(item, dict) and item.get("id"):
                symbols.add(str(item["id"]))
    return len(symbols)


def _watchlist_counts(db: Session, user_ids: List[str]) -> dict[str, int]:
    """Kullanıcı başına izlenen tekrarsız parite sayısı (tek sorguda)."""
    if not user_ids:
        return {}
    rows = (
        db.query(Watchlist.user_id, Watchlist.lists)
        .filter(Watchlist.user_id.in_(user_ids))
        .all()
    )
    return {user_id: _count_watchlist_symbols(lists) for user_id, lists in rows}


def _build_items(db: Session, users: List[User]) -> List[AdminUserItem]:
    """Kullanıcı listesini sayaçlarıyla birlikte hazırlar."""
    user_ids = [u.id for u in users]
    alerts = _alert_summary(db, user_ids)
    strategies = _strategy_counts(db, user_ids)
    watchlists = _watchlist_counts(db, user_ids)

    items: List[AdminUserItem] = []
    for u in users:
        alert_count, alert_symbols = alerts.get(u.id, (0, []))
        items.append(
            AdminUserItem(
                id=u.id,
                email=u.email,
                name=u.name,
                avatar_url=u.avatar_url,
                created_at=u.created_at,
                last_login_at=u.last_login_at,
                strategies_count=strategies.get(u.id, 0),
                alerts_count=alert_count,
                alert_symbols=alert_symbols,
                watchlist_count=watchlists.get(u.id, 0),
            )
        )
    return items


@router.get("/users", response_model=List[AdminUserItem])
def get_all_users(db: Session = Depends(get_db)):
    """
    Tüm kaydolan kullanıcıların listesini ve kullanıcı istatistiklerini getirir.
    """
    users = db.query(User).order_by(User.created_at.desc()).all()
    return _build_items(db, users)


class AdminAlertItem(BaseModel):
    id: str
    symbol: str
    provider: str
    timeframe: str
    target_type: str
    condition: str
    threshold_value: float
    indicator_period: Optional[int] = None
    indicator_period_fast: Optional[int] = None
    indicator_period_slow: Optional[int] = None
    indicator_field: Optional[str] = None
    status: str
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    triggered_at: Optional[datetime] = None
    # Alarmın ne yaptığını anlatan okunabilir Türkçe cümle, örn.
    # "BTCUSDT fiyatı 100'ü geçince" / "BTCUSDT RSI(14) 30'un altına düşünce"
    description: str

    class Config:
        from_attributes = True


class AdminStrategyItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    allow_short: bool = False
    take_profit_pct: Optional[float] = None
    stop_loss_pct: Optional[float] = None
    entry_rules_count: int = 0
    exit_rules_count: int = 0
    timeframe_filters: List[str] = []

    class Config:
        from_attributes = True


class AdminWatchlistItem(BaseModel):
    id: str
    symbol: str
    provider: str
    name: Optional[str] = None


class AdminUserDetail(AdminUserItem):
    alerts: List[AdminAlertItem] = []
    strategies: List[AdminStrategyItem] = []
    watchlist_items: List[AdminWatchlistItem] = []


def _describe_alert(alert: Alert) -> str:
    """Alarmı, admin panelinde gösterilecek okunabilir Türkçe cümleye çevirir."""
    symbol = alert.symbol.upper()
    direction = "üzerine çıkınca" if alert.condition == "rises_above" else "altına düşünce"
    threshold = alert.threshold_value

    if alert.target_type == "price":
        return f"{symbol} fiyatı {threshold} {direction}"
    if alert.target_type == "EMA_CROSS":
        fast = alert.indicator_period_fast or 20
        slow = alert.indicator_period_slow or 50
        return f"{symbol} EMA({fast}/{slow}) kesişimi"
    if alert.target_type == "PERCENT_CHANGE":
        return f"{symbol} yüzdelik değişimi %{threshold} {direction}"

    field = alert.indicator_field or alert.target_type
    period = f"({alert.indicator_period})" if alert.indicator_period else ""
    return f"{symbol} {field}{period} {threshold} {direction}"


def _strategy_rule_counts(rules: Any) -> tuple[int, int, bool, Optional[float], Optional[float], List[str]]:
    """`Strategy.rules` JSON kolonundan özet alanları çıkarır."""
    if not isinstance(rules, dict):
        return 0, 0, False, None, None, []

    def _count(group: Any) -> int:
        if not isinstance(group, dict):
            return 0
        return len(group.get("conditions", []) or [])

    entry_count = _count(rules.get("entry_rules"))
    exit_count = _count(rules.get("exit_rules"))
    allow_short = bool(rules.get("allow_short", False))
    take_profit_pct = rules.get("take_profit_pct")
    stop_loss_pct = rules.get("stop_loss_pct")
    timeframe_filters = rules.get("timeframe_filters") or []
    if not isinstance(timeframe_filters, list):
        timeframe_filters = []
    return entry_count, exit_count, allow_short, take_profit_pct, stop_loss_pct, timeframe_filters


@router.get("/users/{user_id}/detail", response_model=AdminUserDetail)
def get_user_detail(user_id: str, db: Session = Depends(get_db)):
    """
    Tek bir kullanıcının tam detayını getirir: alarmları, stratejileri ve
    izleme listesindeki pariteleri. Genel liste (`/users`) yalnızca sayaçları
    döndürür; bu uç admin panelinde bir satır genişletildiğinde çağrılır.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    base_items = _build_items(db, [user])
    base = base_items[0]

    alerts = db.query(Alert).filter(Alert.user_id == user_id).order_by(Alert.created_at.desc()).all()
    alert_items = [
        AdminAlertItem(
            id=a.id,
            symbol=a.symbol,
            provider=a.provider,
            timeframe=a.timeframe,
            target_type=a.target_type,
            condition=a.condition,
            threshold_value=a.threshold_value,
            indicator_period=a.indicator_period,
            indicator_period_fast=a.indicator_period_fast,
            indicator_period_slow=a.indicator_period_slow,
            indicator_field=a.indicator_field,
            status=a.status,
            note=a.note,
            created_at=a.created_at,
            triggered_at=a.triggered_at,
            description=_describe_alert(a),
        )
        for a in alerts
    ]

    strategies = (
        db.query(Strategy).filter(Strategy.user_id == user_id).order_by(Strategy.created_at.desc()).all()
    )
    strategy_items = []
    for s in strategies:
        entry_count, exit_count, allow_short, tp, sl, tf_filters = _strategy_rule_counts(s.rules)
        strategy_items.append(
            AdminStrategyItem(
                id=s.id,
                name=s.name,
                description=s.description,
                created_at=s.created_at,
                updated_at=s.updated_at,
                allow_short=allow_short,
                take_profit_pct=tp,
                stop_loss_pct=sl,
                entry_rules_count=entry_count,
                exit_rules_count=exit_count,
                timeframe_filters=tf_filters,
            )
        )

    watchlist = db.query(Watchlist).filter(Watchlist.user_id == user_id).first()
    watchlist_items: List[AdminWatchlistItem] = []
    if watchlist and isinstance(watchlist.lists, list):
        seen: set[str] = set()
        for group in watchlist.lists:
            if not isinstance(group, dict):
                continue
            for item in group.get("items", []) or []:
                if not isinstance(item, dict) or not item.get("id"):
                    continue
                item_id = str(item["id"])
                if item_id in seen:
                    continue
                seen.add(item_id)
                watchlist_items.append(
                    AdminWatchlistItem(
                        id=item_id,
                        symbol=str(item.get("symbol", item_id)),
                        provider=str(item.get("provider", "")),
                        name=item.get("name"),
                    )
                )
        watchlist_items.sort(key=lambda i: i.symbol)

    return AdminUserDetail(
        **base.model_dump(),
        alerts=alert_items,
        strategies=strategy_items,
        watchlist_items=watchlist_items,
    )


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db)):
    """
    Platform genel istatistik özeti ve son katılan 5 kullanıcıyı getirir.
    """
    users = db.query(User).order_by(User.created_at.desc()).limit(5).all()

    # Platform genelinde izlenen tekrarsız parite sayısı
    all_watchlists = db.query(Watchlist.lists).all()
    all_symbols: set[str] = set()
    for (lists,) in all_watchlists:
        if not isinstance(lists, list):
            continue
        for group in lists:
            if not isinstance(group, dict):
                continue
            for item in group.get("items", []) or []:
                if isinstance(item, dict) and item.get("id"):
                    all_symbols.add(str(item["id"]))

    return AdminStatsResponse(
        total_users=db.query(User).count(),
        total_strategies=db.query(Strategy).count(),
        total_alerts=db.query(Alert).count(),
        total_watchlist_symbols=len(all_symbols),
        latest_users=_build_items(db, users),
    )
