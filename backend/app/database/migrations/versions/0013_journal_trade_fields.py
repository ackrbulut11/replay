"""manuel backtest icin journal_trades alanlari (Faz 4)

Tablo Faz 1'de iskelet olarak olusturulmustu; manuel backtest icin eksik
alanlar eklenir: acik/kapali durumu, stop-loss/take-profit seviyeleri,
cikis sebebi, giris gerekcesi ve ekran goruntusu.

`status` mevcut satirlar icin CLOSED olarak doldurulur: tabloda bugune
kadar yalnizca kapanmis islem kaydi tutuluyordu, bu yuzden hepsi kapali
kabul edilir.

SQLite ALTER TABLE'i sinirli destekledigi icin kolon ekleme
batch_alter_table icinde yapilir (SKILLS.md Veritabani).

Revision ID: 0013
Revises: 0012
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_COLUMNS = (
    # Islemin hangi piyasa/zaman diliminde acildigi — replay oturumu
    # silinse bile islem tek basina anlamli kalsin diye kolonlanir.
    sa.Column("provider", sa.String(50), nullable=True),
    sa.Column("timeframe", sa.String(20), nullable=True),
    # Pozisyon seviyeleri (mutlak fiyat).
    sa.Column("stop_loss", sa.Float(), nullable=True),
    sa.Column("take_profit", sa.Float(), nullable=True),
    # Giris fiyatina gore yuzdesel sonuc; pnl tutarindan bagimsiz raporlanir.
    sa.Column("pnl_percent", sa.Float(), nullable=True),
    # OPEN / CLOSED
    sa.Column("status", sa.String(20), nullable=True),
    # stop_loss / take_profit / manual
    sa.Column("exit_reason", sa.String(20), nullable=True),
    # Kullanicinin islemi neden actigi (Trade Journal "sebep" alani).
    sa.Column("reason", sa.Text(), nullable=True),
    # Ekran goruntusu: harici URL ya da data URL olarak saklanir.
    sa.Column("screenshot", sa.Text(), nullable=True),
    # Mum zamanlari ve replay icindeki mum indeksleri.
    sa.Column("entry_time", sa.DateTime(), nullable=True),
    sa.Column("exit_time", sa.DateTime(), nullable=True),
    sa.Column("entry_bar_index", sa.Integer(), nullable=True),
    sa.Column("exit_bar_index", sa.Integer(), nullable=True),
    sa.Column("closed_at", sa.DateTime(), nullable=True),
)


def upgrade() -> None:
    with op.batch_alter_table("journal_trades") as batch_op:
        for column in _NEW_COLUMNS:
            batch_op.add_column(column)

    # Mevcut satirlar kapanmis islemlerdir.
    op.execute("UPDATE journal_trades SET status = 'CLOSED' WHERE status IS NULL")

    op.create_index("ix_journal_trades_status", "journal_trades", ["status"])
    op.create_index("ix_journal_trades_created_at", "journal_trades", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_journal_trades_created_at", table_name="journal_trades")
    op.drop_index("ix_journal_trades_status", table_name="journal_trades")

    with op.batch_alter_table("journal_trades") as batch_op:
        for column in reversed(_NEW_COLUMNS):
            batch_op.drop_column(column.name)
