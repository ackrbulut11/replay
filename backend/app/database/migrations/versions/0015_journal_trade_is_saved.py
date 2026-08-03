"""journal_trades: is_saved kolonu

Replay isleminleri normalde yalnizca acildiklari oturumda gorunur (grafigin
onceki denemelerin oklariyla dolmamasi icin). Kullanici bir oturumun gecmisini
"Kaydet" ile isaretlerse o islemler kalici olur ve ayni paritede yapilan
sonraki replaylerde de listelenir.

Revision ID: 0015
Revises: 0014
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default: mevcut satirlar icin ayrica backfill gerekmesin diye.
    # Boolean varsayilani sa.false() ile verilir, ham "0" ile DEGIL: SQLite bunu
    # kabul etse de Postgres "column is of type boolean but expression is of
    # type integer" ile reddediyor ve migration acilista calistigi icin
    # uygulama hic ayaga kalkmiyordu (bkz. 0014'teki ayni hata).
    with op.batch_alter_table("journal_trades") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_saved",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("journal_trades") as batch_op:
        batch_op.drop_column("is_saved")
