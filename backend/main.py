import os
import sys
import threading

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database import models  # noqa: F401  (model metadata'sının yüklenmesi için)
from app.auth.router import router as auth_router
from app.api.routes import alerts, market, strategy, admin, watchlist, analytics, waitlist, chart_settings, journal


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

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Kullanıcı e-postası/IP gibi kişisel veriler varsayılan olarak gönderilmez.
        send_default_pii=False,
    )


def run_migrations() -> None:
    """
    Şemayı Alembic ile güncel tutar (RULES.md #11).

    `Base.metadata.create_all()` yerine migration çalıştırılır; create_all
    eksik tabloları yaratır ama mevcut tabloya kolon ekleyemez ve alembic
    damgası bırakmadığı için sonraki migration'ları bozar.

    Üç durumu da güvenle karşılar:
      1. Sıfır veritabanı            -> tüm revizyonlar uygulanır
      2. Alembic öncesi veritabanı   -> önce 0001 olarak damgalanır, sonra yükseltilir
         (aksi halde "tablo zaten var" hatası verir ve uygulama hiç açılmaz)
      3. Zaten güncel veritabanı     -> hiçbir şey yapılmaz
    """
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    from app.database.postgres import engine

    alembic_cfg = Config(os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic.ini"))

    tables = set(inspect(engine).get_table_names())
    if "alembic_version" not in tables and "users" in tables:
        # Alembic devreye alınmadan önce create_all ile kurulmuş veritabanı.
        print("Alembic damgası yok, mevcut şema 0001 olarak damgalanıyor...")
        command.stamp(alembic_cfg, "0001")

    command.upgrade(alembic_cfg, "head")


def start_market_update_scheduler() -> None:
    """
    Gece yarısı toplu piyasa verisi güncellemesini zamanlar (`scripts/update_market.py`).

    Kullanıcı isteği anında sağlayıcıya (Yahoo Finance vb.) gitmek yerine, veri
    her gece tek kontrollü bir işle önceden çekilip parquet önbelleğine yazılır;
    gün içindeki tüm istekler bu önbellekten okur. Tek uvicorn worker varsayılır —
    birden fazla worker'a geçilirse job'ın tekrar tetiklenmemesi için ek bir
    koruma (ör. sadece "primary" worker'da başlatma) eklenmesi gerekir.
    """
    scripts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")
    sys.path.insert(0, os.path.abspath(scripts_dir))
    from update_market import run_market_update

    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler()
    scheduler.add_job(run_market_update, trigger="cron", hour=0, minute=0, id="nightly_market_update")
    scheduler.start()
    print(f"Gece yarısı piyasa verisi güncelleme işi zamanlandı: {scheduler.get_jobs()}")


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


init_error_monitoring()
run_migrations()
start_market_update_scheduler()
warm_binance_endpoint()

app = FastAPI(
    title="Trading Research Platform API",
    version="0.1.0",
    description="Backend services for Replay, Strategy, Scanner and Journal"
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:1420",
    "https://replay-nine-gold.vercel.app",
]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
    origins.append(settings.FRONTEND_URL)

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

