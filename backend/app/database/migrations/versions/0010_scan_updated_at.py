"""strategy_scans'a updated_at ekle (takili kalan taramalari tespit etmek icin)

Arka plan tarama isini calistiran process (dev server reload, Render deploy/
restart) is bitmeden olurse, `finally` bloğu calismadigi icin kayit
sonsuza dek status='running' kalir; frontend de sayfa her acildiginda bu
durumu "hala calisiyor" sanip sonsuza dek "Taraniyor..." gostermeye devam
eder. `updated_at` her ilerleme adiminda (create/append/finish/fail) guncellenir;
ScannerEngine bunu kullanarak uzun suredir ilerlemeyen "running" kayitlari
okuma aninda hataya cevirir (bkz. app/engines/scanner_engine.py).

Mevcut kayitlar icin created_at degeri kopyalanir.

Revision ID: 0010
Revises: 0009
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("strategy_scans") as batch_op:
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))

    conn = op.get_bind()
    conn.execute(sa.text("UPDATE strategy_scans SET updated_at = created_at WHERE updated_at IS NULL"))


def downgrade() -> None:
    with op.batch_alter_table("strategy_scans") as batch_op:
        batch_op.drop_column("updated_at")
