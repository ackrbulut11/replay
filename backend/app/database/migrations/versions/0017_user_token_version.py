"""users tablosuna token_version kolonu ekler (refresh token iptali).

Cikis yapmak refresh token'i yalnizca TARAYICIDAN siliyordu; sunucu tarafinda
hicbir iz birakmiyordu. Sizmis (ya da paylasilan bir bilgisayarda ele gecirilmis)
bir refresh token 14 gun boyunca gecerli kaliyor, cikis yapmak onu
gecersizlestirmiyordu -- token'in kendisi disinda iptal edilebilecegi bir kayit
yoktu.

`token_version` bunu cozer: refresh token uretilirken icine gomulur, dogrulama
sirasinda kullanicinin guncel degeriyle karsilastirilir. Cikis bu sayaci
artirinca o kullaniciya ait TUM eski refresh token'lar aninda gecersiz olur.

Access token'lar 30 dakikalik olduklari icin surece dahil edilmez; sayac
artmasindan sonra en fazla bir access token omru kadar erisim surer.

Revision ID: 0017
Revises: 0016
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite kolon ekleme/silme icin batch modu gerektirir (bkz. CLAUDE.md).
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("token_version", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("token_version")
