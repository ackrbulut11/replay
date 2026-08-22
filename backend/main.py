import logging
import os
import sys
import threading
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.core.config import settings
from app.database import models  # noqa: F401  (model metadata'sının yüklenmesi için)
from app.database.migrate import run_migrations
from app.auth.router import router as auth_router
from app.api.routes import alerts, market, strategy, admin, watchlist, analytics, waitlist, chart_settings, journal, patterns

logger = logging.getLogger(__name__)


def init_error_monitoring() -> None:
    """
    Sentry'yi başlatır — yalnızca `SENTRY_DSN` doluysa (güvenli varsayılan: kapalı).

    Böylece yerel geliştirmede hiçbir olay gönderilmez; Render'da ortam
    değişkeni set edilince otomatik açılır. Yakalanmamış her exception ve
    500 yanıtı FastAPI entegrasyonu sayesinde otomatik raporlanır.
    """
    if not settings.SENTRY_DSN:
        return

    import sentry_sdk
    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Kullanıcı e-postası/IP gibi kişisel veriler varsayılan olarak gönderilmez.
        send_default_pii=False,
        integrations=[
            # Yakalanan hatalar da Sentry'ye gitsin. Sağlayıcı arızaları,
            # önbellek yazma hataları ve toplu tarama başarısızlıkları geniş
            # `except Exception` bloklarında yakalanıp yalnızca stdout'a
            # yazılıyordu — Sentry kurulu olduğu hâlde bunların HİÇBİRİ
            # raporlanmıyordu, çünkü Sentry yalnızca yakalanmamış exception'ları
            # görüyor. ERROR seviyesi olay üretir, WARNING iz bırakır.
            LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
        ],
    )


def start_market_update_scheduler():
    """
    Gece yarısı toplu piyasa verisi güncellemesini zamanlar (`scripts/update_market.py`).

    Kullanıcı isteği anında sağlayıcıya (Yahoo Finance vb.) gitmek yerine, veri
    her gece tek kontrollü bir işle önceden çekilip parquet önbelleğine yazılır;
    gün içindeki tüm istekler bu önbellekten okur. Tek uvicorn worker varsayılır —
    birden fazla worker'a geçilirse job'ın tekrar tetiklenmemesi için ek bir
    koruma (ör. sadece "primary" worker'da başlatma) eklenmesi gerekir.

    Kapatılabilmesi için zamanlayıcı DÖNDÜRÜLÜR: eskiden modül seviyesinde
    başlatılıp hiç durdurulmuyordu, yani `import main` yapan her süreç (CI'daki
    import kontrolü ve tüm test suite'i dahil) arkada bir zamanlayıcı thread'i
    bırakıyordu.
    """
    scripts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")
    sys.path.insert(0, os.path.abspath(scripts_dir))
    from update_market import run_market_update

    from apscheduler.schedulers.background import BackgroundScheduler

    from app.database.retention import run_event_retention

    scheduler = BackgroundScheduler()
    scheduler.add_job(run_market_update, trigger="cron", hour=0, minute=0, id="nightly_market_update")
    # Telemetri tabloları da sınırsız büyüyordu (RULES.md §24 ile aynı gerekçe):
    # `/api/analytics/events` kimlik doğrulaması gerektirmiyor ve tek bir IP
    # günde on binlerce satır ekleyebiliyordu.
    scheduler.add_job(run_event_retention, trigger="cron", hour=3, minute=0, id="event_retention")
    scheduler.start()
    logger.info("Zamanlanmis isler: %s", scheduler.get_jobs())
    return scheduler


def warm_binance_endpoint() -> None:
    """
    Binance yansı seçimini arkaplanda önceden yapar.

    Seçim, yansıları paralel yoklayıp en hızlısını bulur ve süreç boyunca
    hatırlanır; ama ilk kez çağrıldığında ~1,2 s sürüyor. Burada tetiklenmezse
    o bedeli ilk kullanıcı isteği öderdi — replay'de zaman dilimi değiştirmenin
    bütçesi toplam 1-2 saniye olduğu için bu tek başına bütçeyi taşırıyordu.
    """
    from app.data.providers.binance import get_ordered_endpoints

    threading.Thread(target=get_ordered_endpoints, daemon=True).start()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Açılış/kapanış işleri.

    Bunlar eskiden MODÜL SEVİYESİNDE, `app = FastAPI(...)` satırından bile önce
    çalışıyordu. Yani `import main` demek migration çalıştırmak, bir zamanlayıcı
    thread'i başlatmak ve dışarı ağ isteği atmak demekti — CI'daki
    `python -c "import main"` adımı ve tüm test suite'i bunları tetikliyordu.
    Birden fazla uvicorn worker'a geçilirse her worker aynı anda
    `alembic upgrade head` çalıştırırdı.

    Artık yalnızca uygulama GERÇEKTEN ayağa kalkarken çalışıyorlar ve kapanışta
    düzgün durduruluyorlar.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    settings.assert_production_ready()
    init_error_monitoring()
    run_migrations()

    scheduler = None
    if settings.ENABLE_SCHEDULER:
        scheduler = start_market_update_scheduler()
    warm_binance_endpoint()

    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)


app = FastAPI(
    title="Trading Research Platform API",
    version="0.1.0",
    description="Backend services for Replay, Strategy, Scanner and Journal",
    lifespan=lifespan,
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:1420",
    "https://replay-nine-gold.vercel.app",
]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
    origins.append(settings.FRONTEND_URL)

# Yanıt sıkıştırması. Piyasa uçları JSON mum dizisi döndürüyor ve bu diziler
# büyük: 20.000 mumluk bir 1s yanıtı ~2,4 MB, 100.000 mumluk bir 5dk yanıtı
# ~12 MB. Mumlar birbirine çok benzeyen kısa sayı dizileri olduğu için gzip
# bunları ~10 katı sıkıştırır. Render ile tarayıcı arasındaki bu aktarım,
# önbellek tamamen sıcakken bile "veri yükleniyor" süresinin büyük kısmıydı.
#
# `minimum_size`: küçük JSON yanıtlarını sıkıştırmak kazandırmaz, CPU harcar.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    # Liste daha önce kuruluyor ama middleware'e verilmiyordu; FRONTEND_URL
    # ayarının hiçbir etkisi yoktu.
    allow_origins=origins,
    # Vercel preview dağıtımları rastgele alt alan adı aldığı için regex
    # gerekli, ancak proje adına sabitlendi: eski `https://.*\.vercel\.app`
    # kalıbı herhangi bir vercel.app sitesinin kimlik bilgisiyle istek
    # atmasına izin veriyordu.
    allow_origin_regex=r"https://replay-[a-z0-9-]+\.vercel\.app|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(strategy.router, prefix="/api")
app.include_router(patterns.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(chart_settings.router, prefix="/api")
app.include_router(journal.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
# Landing page'deki erken erişim formu — tek herkese açık yazma ucu.
app.include_router(waitlist.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Trading Research Platform Backend API is running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD)

