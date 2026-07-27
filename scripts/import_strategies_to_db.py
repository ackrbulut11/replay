"""
JSON strateji dosyalarını veritabanına aktarma betiği (tek seferlik geçiş).

Stratejiler artık `storage/strategies/*.json` yerine `strategies` tablosunda,
kullanıcıya bağlı olarak saklanıyor. Bu betik eski dosyaları okur ve belirtilen
kullanıcının hesabına aktarır.

Varsayılan olarak HİÇBİR ŞEY YAZMAZ — önce ne yapacağını gösterir (dry-run).
Gerçekten yazmak için --apply verin.

Kullanım (backend/ dizininden):

    python ../scripts/import_strategies_to_db.py                      # önizleme
    python ../scripts/import_strategies_to_db.py --owner a@b.com      # önizleme
    python ../scripts/import_strategies_to_db.py --owner a@b.com --apply

--owner verilmezse en eski (ilk kaydolan) kullanıcı seçilir.
Aynı ID veritabanında zaten varsa o dosya atlanır; betik tekrar çalıştırılabilir.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# backend/ dizinini import yoluna ekle (betik scripts/ altından çalıştırılıyor)
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.database.models import Strategy, User  # noqa: E402
from app.database.postgres import SessionLocal  # noqa: E402

# Kural ağacında tutulacak alanlar; kimlik/sürüm bilgisi kolonlara gider.
_RULE_KEYS = (
    "parameters",
    "entry_rules",
    "exit_rules",
    "timeframe_filters",
    "allow_short",
    "take_profit_pct",
    "stop_loss_pct",
)


def find_strategy_files() -> list[Path]:
    """Her iki olası storage konumundaki strateji dosyalarını toplar."""
    candidates = [
        _REPO_ROOT / "backend" / "storage" / "strategies",
        _REPO_ROOT / "storage" / "strategies",
    ]
    files: list[Path] = []
    for directory in candidates:
        if directory.is_dir():
            files.extend(sorted(directory.glob("*.json")))
    return files


def resolve_owner(db, owner: str | None) -> User:
    """--owner değerini (e-posta veya kullanıcı ID) çözer; yoksa en eski kullanıcı."""
    if owner:
        user = (
            db.query(User)
            .filter((User.email == owner) | (User.id == owner))
            .first()
        )
        if user is None:
            raise SystemExit(f"HATA: '{owner}' ile eşleşen kullanıcı bulunamadı.")
        return user

    user = db.query(User).order_by(User.created_at.asc()).first()
    if user is None:
        raise SystemExit(
            "HATA: Veritabanında hiç kullanıcı yok. Önce uygulamaya bir kez giriş yapın."
        )
    return user


def build_rules(data: dict) -> dict:
    """Strateji sözlüğünden `rules` kolonuna yazılacak kural ağacını çıkarır."""
    rules = {key: data.get(key) for key in _RULE_KEYS if key in data}
    rules.setdefault("parameters", [])
    rules.setdefault("entry_rules", {"logic": "AND", "conditions": []})
    rules.setdefault("exit_rules", {"logic": "AND", "conditions": []})
    rules.setdefault("timeframe_filters", [])
    rules.setdefault("allow_short", False)
    return rules


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--owner",
        help="Stratejilerin atanacağı kullanıcının e-postası veya ID'si (varsayılan: en eski kullanıcı)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Değişiklikleri gerçekten veritabanına yaz (verilmezse sadece önizleme)",
    )
    args = parser.parse_args()

    files = find_strategy_files()
    if not files:
        print("Aktarılacak JSON strateji dosyası bulunamadı.")
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

            strategy_id = data.get("id") or path.stem
            name = data.get("name") or path.stem

            if db.query(Strategy).filter(Strategy.id == strategy_id).first():
                print(f"  [ATLA ] {name!r} (id={strategy_id}) — veritabanında zaten var")
                skipped += 1
                continue

            print(f"  [AKTAR] {name!r} (id={strategy_id}) -> {owner.email}")
            imported += 1

            if args.apply:
                db.add(
                    Strategy(
                        id=strategy_id,
                        user_id=owner.id,
                        name=name,
                        description=data.get("description", ""),
                        rules=build_rules(data),
                        version=data.get("version", 1),
                    )
                )

        if args.apply:
            db.commit()

        print("-" * 78)
        print(f"Aktarılan: {imported}   Atlanan: {skipped}   Hatalı: {failed}")

        if not args.apply and imported:
            print()
            print("Bu bir önizlemeydi, hiçbir şey yazılmadı.")
            print("Uygulamak için aynı komutu --apply ile çalıştırın.")
        elif args.apply:
            print()
            print("Aktarım tamamlandı. JSON dosyaları silinmedi; doğruladıktan sonra")
            print("elle kaldırabilirsiniz (yedek olarak durabilirler).")

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
