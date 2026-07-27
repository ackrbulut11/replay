import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from app.database.postgres import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    google_id = Column(String(255), unique=True, index=True, nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    initial_balance = Column(Float, default=10000.0)
    currency = Column(String(10), default="USD")
    default_risk_percentage = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Her basarili girisde guncellenir; admin panelinde son aktiflik gostergesi.
    last_login_at = Column(DateTime, nullable=True)

    # Relationships
    strategies = relationship("Strategy", back_populates="user", cascade="all, delete-orphan")
    strategy_scans = relationship("StrategyScan", back_populates="user", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="user", cascade="all, delete-orphan")
    replay_sessions = relationship("ReplaySession", back_populates="user", cascade="all, delete-orphan")
    journal_trades = relationship("JournalTrade", back_populates="user", cascade="all, delete-orphan")
    chart_layouts = relationship("ChartLayout", back_populates="user", cascade="all, delete-orphan")


class Strategy(Base):
    """
    Kullanıcıya ait strateji.

    Stratejinin tamamı (parameters, entry_rules, exit_rules, timeframe_filters,
    allow_short, take_profit_pct, stop_loss_pct) `rules` JSON kolonunda tutulur;
    name/description listeleme ve arama kolaylığı için ayrıca kolonlanmıştır.
    Strateji hâlâ koddur değil veridir (RULES.md #4) — yalnızca saklandığı yer
    dosya değil veritabanıdır, böylece sahiplik user_id ile garanti altındadır.
    """

    __tablename__ = "strategies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    rules = Column(JSON, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="strategies")
    scans = relationship("StrategyScan", back_populates="strategy", cascade="all, delete-orphan")


class StrategyScan(Base):
    """
    Bir stratejinin toplu tarama (batch evaluate) geçmişi.

    Her kayıt tek bir taramanın sonucudur; `results` içinde sembol bazlı
    BatchEvaluateResultItem listesi JSON olarak tutulur.
    """

    __tablename__ = "strategy_scans"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    strategy_id = Column(String(36), ForeignKey("strategies.id", ondelete="CASCADE"), index=True, nullable=False)
    strategy_name = Column(String(255), nullable=True)
    provider = Column(String(50), nullable=False)
    timeframe = Column(String(20), nullable=False)
    scanned_count = Column(Integer, default=0)
    results = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="strategy_scans")
    strategy = relationship("Strategy", back_populates="scans")


class Alert(Base):
    """
    Kullanıcıya ait fiyat / gösterge alarmı.

    Alan isimleri app/alerts/models.py içindeki AlertModel ile birebir aynıdır;
    motor iki temsil arasında doğrudan çeviri yapar.
    """

    __tablename__ = "alerts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), nullable=False, index=True)
    provider = Column(String(50), nullable=False, default="binance")
    timeframe = Column(String(20), nullable=False, default="1d")
    target_type = Column(String(30), nullable=False)
    indicator_period = Column(Integer, nullable=True)
    indicator_period_fast = Column(Integer, nullable=True)
    indicator_period_slow = Column(Integer, nullable=True)
    indicator_field = Column(String(50), nullable=True)
    condition = Column(String(20), nullable=False)
    threshold_value = Column(Float, nullable=False)
    note = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    triggered_at = Column(DateTime, nullable=True)
    last_value = Column(Float, nullable=True)

    user = relationship("User", back_populates="alerts")


class ReplaySession(Base):
    __tablename__ = "replay_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), nullable=False)
    timeframe = Column(String(20), default="1h")
    starting_balance = Column(Float, default=10000.0)
    current_balance = Column(Float, default=10000.0)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="replay_sessions")
    trades = relationship("JournalTrade", back_populates="session", cascade="all, delete-orphan")


class JournalTrade(Base):
    __tablename__ = "journal_trades"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    session_id = Column(String(36), ForeignKey("replay_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    symbol = Column(String(50), nullable=False)
    side = Column(String(10), nullable=False)  # BUY / SELL or LONG / SHORT
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Float, default=1.0)
    pnl = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="journal_trades")
    session = relationship("ReplaySession", back_populates="trades")


class ChartLayout(Base):
    __tablename__ = "chart_layouts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), nullable=False, index=True)
    drawing_data = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="chart_layouts")
