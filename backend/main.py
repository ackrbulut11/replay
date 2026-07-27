import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database import models  # noqa: F401  (model metadata'sının yüklenmesi için)
from app.auth.router import router as auth_router
from app.api.routes import alerts, market, strategy, admin


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


run_migrations()

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
app.include_router(admin.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Trading Research Platform Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD)

