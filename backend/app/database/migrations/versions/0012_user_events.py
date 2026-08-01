"""kullanici bazli olay/hata gunlugu: user_events tablosu

Kullaniciyla karsilasilan hatalari (frontend + backend) ve manuel etiketlenmis
onemli aksiyonlari (strateji kaydetme, alarm olusturma vb.) tek bir tabloda
tutmak icin eklendi. Giris yapmamis bir kullanici da hata uretebilecegi
icin user_id nullable.

Revision ID: 0012
Revises: 0011
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_user_events_user_id", "user_events", ["user_id"])
    op.create_index("ix_user_events_event_type", "user_events", ["event_type"])
    op.create_index("ix_user_events_level", "user_events", ["level"])
    op.create_index("ix_user_events_created_at", "user_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("user_events")
