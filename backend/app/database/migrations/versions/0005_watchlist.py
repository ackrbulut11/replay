"""izleme listelerini kullaniciya bagla: watchlists tablosu

Izleme listeleri yalnizca tarayicinin localStorage'inda tutuluyordu; boylece
cihazlar arasi tasinmiyor ve ayni tarayicida giris yapan bir sonraki kullanici
oncekinin favorilerini goruyordu.

Kullanici basina tek satir; duzenlenebilir listeler (Favoriler + ozel listeler)
JSON olarak saklanir.

Revision ID: 0005
Revises: 0004
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "watchlists",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("lists", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    # Kullanici basina tek kayit olmali.
    op.create_index("ix_watchlists_user_id", "watchlists", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_table("watchlists")
