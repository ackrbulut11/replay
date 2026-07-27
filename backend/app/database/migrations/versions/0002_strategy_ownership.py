"""stratejilere version/updated_at ekle, strategy_scans tablosunu oluştur

Stratejiler artık JSON dosyalarında değil veritabanında, kullanıcıya bağlı
olarak saklanıyor. Tarama (batch evaluate) geçmişi de aynı şekilde kullanıcıya
bağlanıyor.

`strategies` tablosu bu revizyondan önce her ortamda boştu (route'taki hatalı
`content=` alanı yüzünden hiç yazılamamıştı), bu yüzden veri kaybı riski yok.

Revision ID: 0002
Revises: 0001
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite ALTER TABLE'ı sınırlı desteklediği için batch mod kullanılıyor.
    with op.batch_alter_table("strategies") as batch_op:
        batch_op.add_column(
            sa.Column("version", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))

    op.create_table(
        "strategy_scans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "strategy_id",
            sa.String(36),
            sa.ForeignKey("strategies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("strategy_name", sa.String(255), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("timeframe", sa.String(20), nullable=False),
        sa.Column("scanned_count", sa.Integer(), nullable=True),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_strategy_scans_user_id", "strategy_scans", ["user_id"])
    op.create_index("ix_strategy_scans_strategy_id", "strategy_scans", ["strategy_id"])
    op.create_index("ix_strategy_scans_created_at", "strategy_scans", ["created_at"])


def downgrade() -> None:
    op.drop_table("strategy_scans")
    with op.batch_alter_table("strategies") as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("version")
