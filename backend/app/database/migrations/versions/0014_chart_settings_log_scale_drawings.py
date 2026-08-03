"""chart_settings: log_scale ve drawings kolonlari

Logaritmik eksen tercihi ve cizimler (paralel kanal, trend cizgisi vb.)
sayfa yenilendiginde/bir sonraki girişte sifirlaniyordu. rsi/drawing_defaults
ile ayni kullanici basina tek satir deseni izlenir; cizimler
"PROVIDER:SYMBOL" anahtarli bir JSON harita olarak saklanir.

Revision ID: 0014
Revises: 0013
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chart_settings") as batch_op:
        batch_op.add_column(sa.Column("log_scale", sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column("drawings", sa.JSON(), nullable=True))

    op.execute("UPDATE chart_settings SET log_scale = 0 WHERE log_scale IS NULL")
    op.execute("UPDATE chart_settings SET drawings = '{}' WHERE drawings IS NULL")

    with op.batch_alter_table("chart_settings") as batch_op:
        batch_op.alter_column("log_scale", nullable=False)
        batch_op.alter_column("drawings", nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("chart_settings") as batch_op:
        batch_op.drop_column("drawings")
        batch_op.drop_column("log_scale")
