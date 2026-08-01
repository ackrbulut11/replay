from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_admin
from app.database.models import (
    Alert,
    DrawingUsageEvent,
    Strategy,
    User,
    UserEvent,
    WaitlistSignup,
    Watchlist,
)
from app.database.postgres import get_db
from app.engines.strategy_engine import StrategyEngine
from app.rules.strategy_models import StrategyCreateRequest

# Tüm admin uçları ADMIN_EMAILS beyaz listesiyle korunur (router seviyesinde).
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])

_strategy_engine = StrategyEngine()


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


class CountItem(BaseModel):
    label: str
    count: int


class AdminStatsResponse(BaseModel):
    total_users: int
    total_strategies: int
    total_alerts: int
    total_watchlist_symbols: int
    latest_users: List[AdminUserItem]
    # Genel (kullanıcı bazlı değil, platform geneli) istatistikler:
    # hangi çizim aracı ne kadar kullanılmış, en çok çizim yapılan pariteler,
    # en çok favorilere eklenen pariteler (hepsi azalan sırada).
    drawing_usage_by_tool: List[CountItem] = []
    drawing_usage_by_symbol: List[CountItem] = []
    top_favorite_symbols: List[CountItem] = []


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
        .filter(Alert.user_id.in_(user_ids), Alert.status == "ACTIVE")
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


def _drawing_usage_by_tool(db: Session, limit: int = 20) -> List[CountItem]:
    """Platform genelinde çizim aracı başına kullanım sayısı (azalan sırada)."""
    rows = (
        db.query(DrawingUsageEvent.tool, func.count(DrawingUsageEvent.id))
        .group_by(DrawingUsageEvent.tool)
        .order_by(func.count(DrawingUsageEvent.id).desc())
        .limit(limit)
        .all()
    )
    return [CountItem(label=tool, count=count) for tool, count in rows]


def _drawing_usage_by_symbol(db: Session, limit: int = 20) -> List[CountItem]:
    """Platform genelinde parite başına çizim sayısı (azalan sırada, ilk N)."""
    rows = (
        db.query(DrawingUsageEvent.symbol, func.count(DrawingUsageEvent.id))
        .group_by(DrawingUsageEvent.symbol)
        .order_by(func.count(DrawingUsageEvent.id).desc())
        .limit(limit)
        .all()
    )
    return [CountItem(label=symbol, count=count) for symbol, count in rows]


def _top_favorite_symbols(db: Session, limit: int = 20) -> List[CountItem]:
    """
    "Favoriler" listesine en çok eklenen pariteler (tüm kullanıcılar genelinde).

    Yalnızca 'favoriler' grubu sayılır; BIST/NASDAQ/Kripto/Forex gibi türetilmiş
    listeler zaten Favoriler'in bir alt kümesidir ve saklanmaz (bkz. CLAUDE.md).
    """
    rows = db.query(Watchlist.lists).all()
    counts: dict[str, int] = {}
    for (lists,) in rows:
        if not isinstance(lists, list):
            continue
        for group in lists:
            if not isinstance(group, dict) or group.get("id") != "favoriler":
                continue
            for item in group.get("items", []) or []:
                if not isinstance(item, dict):
                    continue
                symbol = item.get("symbol") or item.get("id")
                if symbol:
                    counts[str(symbol)] = counts.get(str(symbol), 0) + 1

    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [CountItem(label=symbol, count=count) for symbol, count in top]


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
    # Her giriş/çıkış kuralı için okunabilir açıklama listesi
    entry_rules_text: List[str] = []
    exit_rules_text: List[str] = []

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


def _describe_operand(op: Any) -> str:
    """Bir operand dict'ini okunabilir kısa metne çevirir."""
    if not isinstance(op, dict):
        return "?"
    t = op.get("type", "")
    if t == "indicator":
        name = op.get("name", "?")
        period = op.get("period", "")
        field = op.get("field", "")
        tf = op.get("timeframe", "")
        parts = f"{name}({period})" if period != "" else name
        if field:
            parts += f".{field}"
        if tf:
            parts += f"[{tf}]"
        return parts
    if t == "price":
        field = op.get("field", "close")
        tf = op.get("timeframe", "")
        return f"{field}[{tf}]" if tf else field
    if t == "value":
        return str(op.get("value", "?"))
    if t == "pnl":
        return "PnL%"
    return str(op)


_OPERATOR_LABEL: dict[str, str] = {
    ">": ">",
    "<": "<",
    ">=": ">=",
    "<=": "<=",
    "==": "==",
    "!=": "!=",
    "cross_above": "↑ kesişir",
    "cross_below": "↓ kesişir",
    "between": "arasında",
}


def _describe_condition(cond: Any) -> str:
    """Tek bir condition dict'ini okunabilir Türkçe metne çevirir."""
    if not isinstance(cond, dict):
        return ""
    left = _describe_operand(cond.get("left"))
    op = _OPERATOR_LABEL.get(cond.get("operator", ""), cond.get("operator", ""))
    right = _describe_operand(cond.get("right"))
    if cond.get("operator") == "between" and cond.get("right2"):
        right2 = _describe_operand(cond.get("right2"))
        return f"{left} {op} {right} - {right2}"
    return f"{left} {op} {right}"


def _extract_rules_text(group: Any) -> List[str]:
    """Bir condition grubunun koşullarını metin listesi olarak döndürür."""
    if not isinstance(group, dict):
        return []
    conditions = group.get("conditions") or []
    texts = [_describe_condition(c) for c in conditions if isinstance(c, dict)]
    return texts


def _strategy_rule_counts(
    rules: Any,
) -> tuple[int, int, bool, Optional[float], Optional[float], List[str], List[str], List[str]]:
    """`Strategy.rules` JSON kolonundan özet alanları çıkarır."""
    if not isinstance(rules, dict):
        return 0, 0, False, None, None, [], [], []

    def _count(group: Any) -> int:
        if not isinstance(group, dict):
            return 0
        return len(group.get("conditions", []) or [])

    entry_group = rules.get("entry_rules")
    exit_group = rules.get("exit_rules")

    entry_count = _count(entry_group)
    exit_count = _count(exit_group)
    allow_short = bool(rules.get("allow_short", False))
    take_profit_pct = rules.get("take_profit_pct")
    stop_loss_pct = rules.get("stop_loss_pct")
    timeframe_filters = rules.get("timeframe_filters") or []
    if not isinstance(timeframe_filters, list):
        timeframe_filters = []
    entry_texts = _extract_rules_text(entry_group)
    exit_texts = _extract_rules_text(exit_group)
    return entry_count, exit_count, allow_short, take_profit_pct, stop_loss_pct, timeframe_filters, entry_texts, exit_texts


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
        entry_count, exit_count, allow_short, tp, sl, tf_filters, entry_texts, exit_texts = _strategy_rule_counts(s.rules)
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
                entry_rules_text=entry_texts,
                exit_rules_text=exit_texts,
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


@router.post("/strategies/{strategy_id}/clone-to-me", response_model=AdminStrategyItem)
def clone_strategy_to_me(
    strategy_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> AdminStrategyItem:
    """
    Herhangi bir kullanıcıya ait bir stratejiyi (kural ağacı birebir aynı
    kalacak şekilde) admin panelinden bakan admin'in KENDİ hesabına kopyalar
    — böylece admin bir kullanıcının stratejisini kendi hesabında test
    edebilir. Sahiplik yalnızca `current_admin.id`'den alınır, admin başka
    bir kullanıcının hesabına yazamaz; sadece kendi hesabına kopya oluşturur
    (RULES.md'deki sahiplik modeliyle tutarlı).
    """
    source = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Strateji bulunamadı")

    rules = source.rules or {}
    request = StrategyCreateRequest(
        name=f"{source.name} (Kopya)",
        description=source.description or "",
        parameters=rules.get("parameters", []),
        entry_rules=rules.get("entry_rules", {"logic": "AND", "conditions": []}),
        exit_rules=rules.get("exit_rules", {"logic": "AND", "conditions": []}),
        timeframe_filters=rules.get("timeframe_filters", []),
        allow_short=rules.get("allow_short", False),
        take_profit_pct=rules.get("take_profit_pct"),
        stop_loss_pct=rules.get("stop_loss_pct"),
    )
    created = _strategy_engine.create_strategy(db, request, user_id=current_admin.id)
    new_row = db.query(Strategy).filter(Strategy.id == created["id"]).first()

    entry_count, exit_count, allow_short, tp, sl, tf_filters, entry_texts, exit_texts = _strategy_rule_counts(
        new_row.rules
    )
    return AdminStrategyItem(
        id=new_row.id,
        name=new_row.name,
        description=new_row.description,
        created_at=new_row.created_at,
        updated_at=new_row.updated_at,
        allow_short=allow_short,
        take_profit_pct=tp,
        stop_loss_pct=sl,
        entry_rules_count=entry_count,
        exit_rules_count=exit_count,
        timeframe_filters=tf_filters,
        entry_rules_text=entry_texts,
        exit_rules_text=exit_texts,
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
        drawing_usage_by_tool=_drawing_usage_by_tool(db),
        drawing_usage_by_symbol=_drawing_usage_by_symbol(db),
        top_favorite_symbols=_top_favorite_symbols(db),
    )


class WaitlistEntry(BaseModel):
    email: str
    source: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/waitlist", response_model=List[WaitlistEntry])
def get_waitlist(db: Session = Depends(get_db)):
    """
    Landing page'deki erken erişim formuna bırakılan e-postaları getirir
    (en yeni önce). Yazma ucu herkese açık, okuma ucu yalnızca admin.
    """
    return (
        db.query(WaitlistSignup)
        .order_by(WaitlistSignup.created_at.desc())
        .limit(500)
        .all()
    )


class UserEventEntry(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    event_type: str
    level: str
    message: Optional[str] = None
    context: Optional[dict] = None
    created_at: Optional[datetime] = None


@router.get("/events", response_model=List[UserEventEntry])
def get_user_events(
    event_type: Optional[str] = None,
    level: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    """
    Kullanıcıların karşılaştığı hataları ve etiketlenmiş aksiyonları getirir
    (en yeni önce). `event_type`/`level`/`user_id` ile filtrelenebilir.
    """
    query = db.query(UserEvent, User.email).outerjoin(User, UserEvent.user_id == User.id)
    if event_type:
        query = query.filter(UserEvent.event_type == event_type)
    if level:
        query = query.filter(UserEvent.level == level)
    if user_id:
        query = query.filter(UserEvent.user_id == user_id)

    rows = query.order_by(UserEvent.created_at.desc()).limit(min(limit, 1000)).all()
    return [
        UserEventEntry(
            id=event.id,
            user_id=event.user_id,
            user_email=email,
            event_type=event.event_type,
            level=event.level,
            message=event.message,
            context=event.context,
            created_at=event.created_at,
        )
        for event, email in rows
    ]
