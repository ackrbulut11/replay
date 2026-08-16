"""strategy_scans tablosuna portfoy ozeti kolonu ekler.

Toplu tarama her sembolu BAGIMSIZ test ediyor: her biri sanki tum sermaye ona
ayrilmis gibi hesaplaniyor. Sermaye paylastirmali portfoy sonucu bundan farkli
oldugu icin ayri saklanir; tarama bittiginde bir kez hesaplanip buraya yazilir.

Yalnizca OZET tutulur (bakiyeler, sayilar, performans metrikleri) -- ham islem
listesi burada birikirse satir boyu sembol sayisiyla dogru orantili buyurdu.

Revision ID: 0016
Revises: 0015
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite kolon ekleme/silme icin batch modu gerektirir (bkz. CLAUDE.md).
    with op.batch_alter_table("strategy_scans") as batch_op:
        batch_op.add_column(sa.Column("portfolio", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("strategy_scans") as batch_op:
        batch_op.drop_column("portfolio")
