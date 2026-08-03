import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    DateTime,
    ForeignKey,
    Text,
    JSON,
    Boolean,
    UniqueConstraint,
    false as sa_false,
)
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
    strategy_evaluations = relationship(
        "StrategyEvaluation", back_populates="user", cascade="all, delete-orphan"
    )
    alerts = relationship("Alert", back_populates="user", cascade="all, delete-orphan")
    watchlist = relationship(
        "Watchlist", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    replay_sessions = relationship("ReplaySession", back_populates="user", cascade="all, delete-orphan")
    journal_trades = relationship("JournalTrade", back_populates="user", cascade="all, delete-orphan")
    chart_layouts = relationship("ChartLayout", back_populates="user", cascade="all, delete-orphan")
    drawing_usage_events = relationship(
        "DrawingUsageEvent", back_populates="user", cascade="all, delete-orphan"
    )
    chart_settings = relationship(
        "ChartSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    user_events = relationship(
        "UserEvent", back_populates="user", cascade="all, delete-orphan"
    )


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
    evaluations = relationship(
        "StrategyEvaluation", back_populates="strategy", cascade="all, delete-orphan"
    )


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
    total_symbols = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="done")
    error = Column(Text, nullable=True)
    results = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="strategy_scans")
    strategy = relationship("Strategy", back_populates="scans")


class StrategyEvaluation(Base):
    """
    Tekli strateji testi (single evaluate) geçmişi.

    Aynı strateji + sağlayıcı + parite + zaman dilimi için tek kayıt tutulur;
    yeni test eskisinin yerini alır (benzersiz kısıt bunu garanti eder).
    Özet alanlar listeleme için kolonlanmış, tam sonuç `result` içinde durur.
    """

    __tablename__ = "strategy_evaluations"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "strategy_id",
            "provider",
            "symbol",
            "timeframe",
            name="uq_strategy_evaluation_combo",
        ),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    strategy_id = Column(String(36), ForeignKey("strategies.id", ondelete="CASCADE"), index=True, nullable=False)
    strategy_name = Column(String(255), nullable=True)
    symbol = Column(String(50), nullable=False)
    provider = Column(String(50), nullable=False)
    timeframe = Column(String(20), nullable=False)
    total_bars = Column(Integer, default=0)
    total_trades = Column(Integer, default=0)
    win_rate = Column(Float, default=0.0)
    total_pnl_percent = Column(Float, default=0.0)
    # Testi üreten istek; geçmişten seçilince form bu değerlerle geri yüklenir.
    request = Column(JSON, nullable=True)
    # Sinyaller dahil tam sonuç.
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="strategy_evaluations")
    strategy = relationship("Strategy", back_populates="evaluations")


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


class Watchlist(Base):
    """
    Kullanıcının izleme listeleri (kullanıcı başına tek satır).

    `lists`, kullanıcının düzenleyebildiği listeleri (Favoriler + özel listeler)
    JSON dizisi olarak tutar. BIST/NASDAQ/Kripto/Forex listeleri Favoriler'den
    provider'a göre türetildiği için saklanmaz, arayüzde hesaplanır.

    Panel genişliği / açık-kapalı gibi cihaza özel tercihler burada tutulmaz;
    onlar tarayıcıda kalır.
    """

    __tablename__ = "watchlists"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        unique=True,
        nullable=False,
    )
    lists = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="watchlist")


class ChartSettings(Base):
    """
    Kullanıcının grafik tercihleri (kullanıcı başına tek satır).

    RSI period/aşırı alım-satım seviyeleri ve çizim araçlarının varsayılan
    stilleri (renk, kalınlık, opaklık, çizgi tipi) burada tutulur. Şema
    bilinçli olarak gevşek (JSON) tutulmuştur; arayüze yeni bir gösterge veya
    çizim aracı eklemek migration gerektirmesin diye (bkz. Watchlist).
    """

    __tablename__ = "chart_settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        unique=True,
        nullable=False,
    )
    rsi = Column(JSON, nullable=False, default=dict)
    drawing_defaults = Column(JSON, nullable=False, default=dict)
    # Logaritmik fiyat eksenini kalıcı kılar (bkz. CandleChart PriceScaleMode).
    log_scale = Column(Boolean, nullable=False, default=False)
    # Çizimler "PROVIDER:SYMBOL" anahtarıyla saklanır (bkz. CandleChart
    # currentDrawingKeyRef), her paritenin kendi çizim seti korunur.
    drawings = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="chart_settings")


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
    """
    Manuel backtest (replay) sırasında açılan tek bir işlem.

    Hem açık hem kapalı pozisyonları tutar; `status` OPEN olduğu sürece
    `exit_price`/`pnl` boştur. Pozisyon yaşam döngüsü ve kâr/zarar hesabı
    `engines/replay_engine.py` içindedir — bu sınıf yalnızca saklama.
    """

    __tablename__ = "journal_trades"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    session_id = Column(String(36), ForeignKey("replay_sessions.id", ondelete="SET NULL"), index=True, nullable=True)
    symbol = Column(String(50), nullable=False)
    # Replay oturumu silinse bile işlem tek başına anlamlı kalsın diye kolonlanır.
    provider = Column(String(50), nullable=True)
    timeframe = Column(String(20), nullable=True)
    side = Column(String(10), nullable=False)  # long / short
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Float, default=1.0)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    # Açık pozisyonda None kalır: 0.0 olsaydı "henüz gerçekleşmedi" ile
    # "başabaş kapandı" ayırt edilemezdi ve rapora başabaş işlem olarak girerdi.
    pnl = Column(Float, nullable=True)
    pnl_percent = Column(Float, nullable=True)
    status = Column(String(20), nullable=True, default="OPEN", index=True)
    exit_reason = Column(String(20), nullable=True)  # stop_loss / take_profit / manual
    # Trade Journal alanları: neden girildiği, serbest not ve ekran görüntüsü.
    reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    screenshot = Column(Text, nullable=True)  # harici URL ya da data URL
    entry_time = Column(DateTime, nullable=True)
    exit_time = Column(DateTime, nullable=True)
    entry_bar_index = Column(Integer, nullable=True)
    exit_bar_index = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    closed_at = Column(DateTime, nullable=True)
    # Kullanici bu oturumun gecmisini "Kaydet" ile isaretlediyse True olur ve
    # islem, ayni paritedeki sonraki replay oturumlarinda da gorunur.
    is_saved = Column(Boolean, nullable=False, default=False, server_default=sa_false(), index=True)

    user = relationship("User", back_populates="journal_trades")
    session = relationship("ReplaySession", back_populates="trades")


class DrawingUsageEvent(Base):
    """
    Bir çizim aracının kullanıldığı her an için tek satırlık kayıt.

    Çizimlerin kendisi kalıcı tutulmuyor (grafik bileşeni yalnızca sekme
    açıkken bellekte tutar, bkz. CandleChart.tsx); bu tablo yalnızca admin
    panelindeki genel istatistikler ("hangi araç ne kadar kullanıldı",
    "hangi paritede kaç çizim yapıldı") için kullanım sayacı tutar.
    """

    __tablename__ = "drawing_usage_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    tool = Column(String(30), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="drawing_usage_events")


class UserEvent(Base):
    """
    Kullanıcı bazlı genel olay kaydı: karşılaşılan hatalar (frontend/backend) ve
    manuel olarak etiketlenmiş önemli aksiyonlar (strateji kaydetme, alarm
    oluşturma vb.) için tek satırlık log.

    `event_type` olayın türünü (ör. "frontend_error", "api_error",
    "strategy_saved", "alert_created"), `level` önemini ("info"/"warning"/
    "error") belirtir. `context` serbest biçimli JSON'dur (ör. hata stack'i,
    ilgili sembol) — şema, her yeni olay türü için migration gerektirmesin
    diye bilinçli olarak gevşek tutulmuştur (bkz. ChartSettings).

    Giriş yapmamış bir kullanıcı da hata üretebileceği için user_id nullable'dır.
    """

    __tablename__ = "user_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    event_type = Column(String(50), nullable=False, index=True)
    level = Column(String(20), nullable=False, default="info", index=True)
    message = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="user_events")


class WaitlistSignup(Base):
    """
    Landing page'de erken erişim listesine bırakılan e-posta adresi.

    Bilinçli olarak `users` tablosuna bağlı değildir: listeye katılanların
    çoğunun henüz hesabı yok. E-posta benzersizdir, böylece aynı adres ikinci
    kez gönderildiğinde yeni satır açılmaz (uç nokta fikir olarak idempotent).
    """

    __tablename__ = "waitlist_signups"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    # Formun bulunduğu bölüm ("hero", "footer" vb.) — hangi CTA'nın çalıştığını
    # görmek için. Kişisel veri değildir, boş olabilir.
    source = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ChartLayout(Base):
    __tablename__ = "chart_layouts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(50), nullable=False, index=True)
    drawing_data = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="chart_layouts")
