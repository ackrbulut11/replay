"""
JSON alarm dosyalarını veritabanına aktarma betiği (tek seferlik geçiş).

Alarmlar artık `storage/alerts/*.json` yerine `alerts` tablosunda, kullanıcıya
bağlı olarak saklanıyor. Bu betik eski dosyaları okur ve belirtilen kullanıcının
hesabına aktarır.

Varsayılan olarak HİÇBİR ŞEY YAZMAZ — önce ne yapacağını gösterir (dry-run).
Gerçekten yazmak için --apply verin.

Kullanım (backend/ dizininden):

    python ../scripts/import_alerts_to_db.py                      # önizleme
    python ../scripts/import_alerts_to_db.py --owner a@b.com --apply

--owner verilmezse en eski (ilk kaydolan) kullanıcı seçilir.
Aynı ID veritabanında zaten varsa o dosya atlanır; betik tekrar çalıştırılabilir.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# backend/ dizinini import yoluna ekle (betik scripts/ altından çalıştırılıyor)
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.database.models import Alert, User  # noqa: E402
from app.database.postgres import SessionLocal  # noqa: E402


def find_alert_files() -> list[Path]:
    """Her iki olası storage konumundaki alarm dosyalarını toplar."""
    candidates = [
        _REPO_ROOT / "backend" / "storage" / "alerts",
        _REPO_ROOT / "storage" / "alerts",
    ]
    files: list[Path] = []
    for directory in candidates:
        if directory.is_dir():
            files.extend(sorted(directory.glob("*.json")))
    return files


def resolve_owner(db, owner: str | None) -> User:
    """--owner değerini (e-posta veya kullanıcı ID) çözer; yoksa en eski kullanıcı."""
    if owner:
        user = db.query(User).filter((User.email == owner) | (User.id == owner)).first()
        if user is None:
            raise SystemExit(f"HATA: '{owner}' ile eşleşen kullanıcı bulunamadı.")
        return user

    user = db.query(User).order_by(User.created_at.asc()).first()
    if user is None:
        raise SystemExit(
            "HATA: Veritabanında hiç kullanıcı yok. Önce uygulamaya bir kez giriş yapın."
        )
    return user


def _parse_dt(value) -> datetime | None:
    """ISO 8601 (sondaki Z dahil) metni datetime'a çevirir."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", ""))
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", help="Alarmların atanacağı kullanıcının e-postası veya ID'si")
    parser.add_argument("--apply", action="store_true", help="Değişiklikleri gerçekten yaz")
    args = parser.parse_args()

    files = find_alert_files()
    if not files:
        print("Aktarılacak JSON alarm dosyası bulunamadı.")
        return 0

    db = SessionLocal()
    try:
        owner = resolve_owner(db, args.owner)
        print(f"Hedef kullanıcı : {owner.email} ({owner.id})")
        print(f"Bulunan dosya   : {len(files)}")
        print(f"Mod             : {'YAZMA (--apply)' if args.apply else 'ÖNİZLEME (dry-run)'}")
        print("-" * 78)

        imported = skipped = failed = 0

        for path in files:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                print(f"  [HATA ] {path.name}: okunamadı ({exc})")
                failed += 1
                continue

            alert_id = data.get("id") or path.stem
            symbol = (data.get("symbol") or "?").upper()

            if db.query(Alert).filter(Alert.id == alert_id).first():
                print(f"  [ATLA ] {symbol} (id={alert_id}) — veritabanında zaten var")
                skipped += 1
                continue

            print(f"  [AKTAR] {symbol} {data.get('target_type')} (id={alert_id}) -> {owner.email}")
            imported += 1

            if args.apply:
                db.add(
                    Alert(
                        id=alert_id,
                        user_id=owner.id,
                        symbol=symbol,
                        provider=(data.get("provider") or "binance").lower(),
                        timeframe=data.get("timeframe") or "1d",
                        target_type=data.get("target_type") or "price",
                        indicator_period=data.get("indicator_period"),
                        indicator_period_fast=data.get("indicator_period_fast"),
                        indicator_period_slow=data.get("indicator_period_slow"),
                        indicator_field=data.get("indicator_field"),
                        condition=data.get("condition") or "rises_above",
                        threshold_value=float(data.get("threshold_value") or 0.0),
                        note=data.get("note"),
                        status=data.get("status") or "ACTIVE",
                        created_at=_parse_dt(data.get("created_at")) or datetime.utcnow(),
                        triggered_at=_parse_dt(data.get("triggered_at")),
                        last_value=data.get("last_value"),
                    )
                )

        if args.apply:
            db.commit()

        print("-" * 78)
        print(f"Aktarılan: {imported}   Atlanan: {skipped}   Hatalı: {failed}")

        if not args.apply and imported:
            print("\nBu bir önizlemeydi, hiçbir şey yazılmadı.")
            print("Uygulamak için aynı komutu --apply ile çalıştırın.")

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
