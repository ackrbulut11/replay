"""alarmlari kullaniciya bagla: alerts tablosu

Alarmlar `storage/alerts/*.json` yerine veritabaninda, kullaniciya bagli
olarak saklanmaya baslar. Eski JSON dosyalari
`scripts/import_alerts_to_db.py` ile aktarilir.

Revision ID: 0003
Revises: 0002
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("timeframe", sa.String(20), nullable=False),
        sa.Column("target_type", sa.String(30), nullable=False),
        sa.Column("indicator_period", sa.Integer(), nullable=True),
        sa.Column("indicator_period_fast", sa.Integer(), nullable=True),
        sa.Column("indicator_period_slow", sa.Integer(), nullable=True),
        sa.Column("indicator_field", sa.String(50), nullable=True),
        sa.Column("condition", sa.String(20), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("triggered_at", sa.DateTime(), nullable=True),
        sa.Column("last_value", sa.Float(), nullable=True),
    )
    op.create_index("ix_alerts_user_id", "alerts", ["user_id"])
    op.create_index("ix_alerts_symbol", "alerts", ["symbol"])
    op.create_index("ix_alerts_status", "alerts", ["status"])


def downgrade() -> None:
    op.drop_table("alerts")
