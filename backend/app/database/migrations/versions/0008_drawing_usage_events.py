"""cizim kullanim istatistigi: drawing_usage_events tablosu

Cizimlerin kendisi kalici tutulmuyor (grafik bileseni yalnizca sekme acikken
bellekte tutar); admin panelinde "hangi arac ne kadar kullanildi" / "hangi
paritede kac cizim yapildi" gibi genel istatistikler icin her cizim
tamamlandiginda tek satirlik bir kullanim kaydi eklenir.

Revision ID: 0008
Revises: 0007
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "drawing_usage_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("tool", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_drawing_usage_events_user_id", "drawing_usage_events", ["user_id"])
    op.create_index("ix_drawing_usage_events_symbol", "drawing_usage_events", ["symbol"])
    op.create_index("ix_drawing_usage_events_tool", "drawing_usage_events", ["tool"])
    op.create_index("ix_drawing_usage_events_created_at", "drawing_usage_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("drawing_usage_events")
