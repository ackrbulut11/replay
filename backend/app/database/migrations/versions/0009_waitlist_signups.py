"""erken erisim listesi: waitlist_signups tablosu

Landing page'deki "erken erisim" formu, hesabi olmayan ziyaretcilerin
e-postasini buraya yazar. users tablosuna bagli degildir; e-posta benzersiz
oldugu icin ayni adresin ikinci gonderimi yeni satir acmaz.

Revision ID: 0009
Revises: 0008
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "waitlist_signups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_waitlist_signups_email", "waitlist_signups", ["email"], unique=True
    )
    op.create_index("ix_waitlist_signups_created_at", "waitlist_signups", ["created_at"])


def downgrade() -> None:
    op.drop_table("waitlist_signups")
