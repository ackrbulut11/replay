"""
Şema güncelleme (Alembic) — tek giriş noktası.

Eskiden `main.py` içindeydi ve MODÜL SEVİYESİNDE, `app = FastAPI(...)`
satırından bile önce çağrılıyordu. Yani `import main` demek migration
çalıştırmak demekti: CI'daki `python -c "import main"` adımı ve tüm test
suite'i bunu tetikliyordu. Birden fazla uvicorn worker'a geçilirse her worker
aynı anda `alembic upgrade head` çalıştırırdı.

Buraya taşınınca üç taraf da açıkça çağırabiliyor: uygulama (lifespan),
testler (`tests/__init__.py`) ve gerekirse bir script — ve import'un kendisi
yan etkisiz kalıyor (RULES.md #11).
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# alembic.ini `backend/` dizinindedir; bu dosya `backend/app/database/` altında.
_BACKEND_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
)
ALEMBIC_INI = os.path.join(_BACKEND_DIR, "alembic.ini")


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

    alembic_cfg = Config(ALEMBIC_INI)

    tables = set(inspect(engine).get_table_names())
    if "alembic_version" not in tables and "users" in tables:
        # Alembic devreye alınmadan önce create_all ile kurulmuş veritabanı.
        logger.info("Alembic damgasi yok, mevcut sema 0001 olarak damgalaniyor")
        command.stamp(alembic_cfg, "0001")

    command.upgrade(alembic_cfg, "head")
