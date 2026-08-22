"""
Olay tablolarının budanması.

RULES.md §24-27 ham piyasa verisi için "sınırsız biriktirmek yasak" diyor;
aynı gerekçe telemetri tabloları için de geçerli ve orada hiçbir sınır yoktu:

  * `user_events` — `/api/analytics/events` ucu KİMLİK DOĞRULAMASI GEREKTİRMEZ
    (giriş yapmamış bir kullanıcı da hata üretebilmeli). IP başına dakikada 30
    kayıt sınırı var, yani tek bir IP günde 43.200 satır ekleyebiliyor ve
    hiçbiri silinmiyordu.
  * `drawing_usage_events` — her tamamlanan çizim bir satır. Aktif kullanımda
    kullanıcı başına günde yüzlerce satır demek.

İkisi de yalnızca admin panelindeki TOPLU istatistikler için var; eski satırlar
hiçbir soruya cevap vermiyor. Bu yüzden en yeni N kayıt tutulur, gerisi silinir.

Budama gece yarısı işiyle birlikte çalışır (bkz. `main.lifespan`).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.database.models import DrawingUsageEvent, UserEvent

logger = logging.getLogger(__name__)

# Tabloda tutulacak azami satır sayısı. Admin paneli son dönem eğilimlerine
# bakıyor; bundan eskisi istatistiği anlamlı şekilde değiştirmiyor.
MAX_USER_EVENTS = 50_000
MAX_DRAWING_USAGE_EVENTS = 50_000


def _prune_table(db: Session, model, limit: int) -> int:
    """En yeni `limit` kaydı bırakır, geri kalanını siler.

    Kesim noktası `limit`inci en yeni kaydın zaman damgasıdır (yani
    `offset(limit - 1)`); silme bu damgadan ESKİ olanlara uygulanır, böylece
    tam olarak `limit` kayıt kalır. Tek tek satır çekip silmek yerine tek bir
    DELETE kullanılır — tablo büyükse aradaki fark saniyelerledir.

    Aynı damgayı taşıyan kayıtlar birlikte kalır; sınır bu yüzden kesin değil
    "yaklaşık" bir tavandır ve öyle olması yeterlidir.

    Portatiftir: SQLite ve Postgres'te aynı şekilde çalışır.
    """
    if limit <= 0:
        return 0

    cutoff_row = (
        db.query(model.created_at)
        .order_by(model.created_at.desc())
        .offset(limit - 1)
        .limit(1)
        .first()
    )
    if cutoff_row is None or cutoff_row[0] is None:
        # Tablo sınırdan küçük: silinecek bir şey yok.
        return 0

    deleted = (
        db.query(model)
        .filter(model.created_at < cutoff_row[0])
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


def prune_event_tables(db: Session) -> dict[str, int]:
    """Telemetri tablolarını tavanlarının altına çeker; silinen satır sayısını döndürür."""
    result = {
        "user_events": _prune_table(db, UserEvent, MAX_USER_EVENTS),
        "drawing_usage_events": _prune_table(
            db, DrawingUsageEvent, MAX_DRAWING_USAGE_EVENTS
        ),
    }
    if any(result.values()):
        logger.info("Olay tablolari budandi: %s", result)
    return result


def run_event_retention() -> dict[str, int]:
    """Zamanlayıcıdan çağrılan sarmalayıcı — kendi oturumunu açar ve kapatır."""
    from app.database.postgres import SessionLocal

    db = SessionLocal()
    try:
        return prune_event_tables(db)
    except Exception as exc:
        db.rollback()
        logger.warning("Olay tablolari budanamadi: %s", exc, exc_info=True)
        return {}
    finally:
        db.close()
