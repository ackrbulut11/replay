"""strategy_scans'a asenkron tarama durumu ekle

Coklu sembol taramasi artik arka planda (background job) calisiyor;
POST /batch-evaluate aninda bir scan_id donup taramayi arka planda
baslatiyor, frontend ilerlemeyi /scans/{scan_id}/status ile sorguluyor.
Bu sayede Vercel'in harici rewrite proxy'sindeki ~30sn sabit zaman
asimi (ROUTER_EXTERNAL_TARGET_ERROR) tek bir uzun HTTP istegine artik
hic takilmiyor.

Mevcut kayitlar (eski senkron tarama sonuclari) status='done' olarak
isaretlenir.

Revision ID: 0007
Revises: 0006
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("strategy_scans") as batch_op:
        batch_op.add_column(sa.Column("total_symbols", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("status", sa.String(20), nullable=False, server_default="done")
        )
        batch_op.add_column(sa.Column("error", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("strategy_scans") as batch_op:
        batch_op.drop_column("error")
        batch_op.drop_column("status")
        batch_op.drop_column("total_symbols")
