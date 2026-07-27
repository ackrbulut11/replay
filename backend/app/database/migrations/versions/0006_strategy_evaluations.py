"""tekli test gecmisini kullaniciya bagla: strategy_evaluations tablosu

Tekli degerlendirme gecmisi yalnizca tarayicinin localStorage'inda
tutuluyordu; cihazlar arasi tasinmiyordu ve sinyaller dahil tam sonuc
saklandigi icin tarayici kotasi tasabiliyordu.

Ayni strateji + saglayici + parite + zaman dilimi icin tek kayit tutulur;
benzersiz kisit bunu garanti eder.

Revision ID: 0006
Revises: 0005
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "strategy_evaluations",
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
        sa.Column("symbol", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("timeframe", sa.String(20), nullable=False),
        sa.Column("total_bars", sa.Integer(), nullable=True),
        sa.Column("total_trades", sa.Integer(), nullable=True),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column("total_pnl_percent", sa.Float(), nullable=True),
        sa.Column("request", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "user_id",
            "strategy_id",
            "provider",
            "symbol",
            "timeframe",
            name="uq_strategy_evaluation_combo",
        ),
    )
    op.create_index("ix_strategy_evaluations_user_id", "strategy_evaluations", ["user_id"])
    op.create_index("ix_strategy_evaluations_strategy_id", "strategy_evaluations", ["strategy_id"])
    op.create_index("ix_strategy_evaluations_created_at", "strategy_evaluations", ["created_at"])


def downgrade() -> None:
    op.drop_table("strategy_evaluations")
