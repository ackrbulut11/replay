"""kullanici bazli grafik ayarlari: chart_settings tablosu

RSI period/asiri alim-satim seviyeleri ve cizim araclarinin varsayilan
stilleri (renk, kalinlik, opaklik, cizgi tipi) sabit kodluydu; artik
kullanici basina saklanir ve her cihazda ayni kalir.

Revision ID: 0011
Revises: 0010
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chart_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rsi", sa.JSON(), nullable=False),
        sa.Column("drawing_defaults", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    # Kullanici basina tek kayit olmali.
    op.create_index("ix_chart_settings_user_id", "chart_settings", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_table("chart_settings")
