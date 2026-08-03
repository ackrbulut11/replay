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

    # Boolean varsayilani ham SQL'de "0" olarak yazilamaz: SQLite gevsek tipli
    # oldugu icin yerelde sorunsuz calisiyordu, ama Postgres bunu reddediyor
    # ("column log_scale is of type boolean but expression is of type integer")
    # ve migration basarisiz olunca uygulama hic acilmiyordu. sa.false() her iki
    # dialect'te de dogru literali uretir (Postgres'te "false", SQLite'ta "0").
    #
    # `drawings` de ayni sebeple ham SQL'den cikarildi: JSON kolona '{}' metin
    # literali yazmak Postgres'te tur cikarimina bagli kaliyordu. Python sozlugu
    # vermek her iki dialect'te de dogru serilestirmeyi uretir (Postgres'te
    # acik ::JSON cast'i ile).
    chart_settings = sa.table(
        "chart_settings",
        sa.column("log_scale", sa.Boolean()),
        sa.column("drawings", sa.JSON()),
    )
    op.execute(
        chart_settings.update()
        .where(chart_settings.c.log_scale.is_(None))
        .values(log_scale=sa.false())
    )
    op.execute(
        chart_settings.update()
        .where(chart_settings.c.drawings.is_(None))
        .values(drawings={})
    )

    with op.batch_alter_table("chart_settings") as batch_op:
        batch_op.alter_column("log_scale", nullable=False)
        batch_op.alter_column("drawings", nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("chart_settings") as batch_op:
        batch_op.drop_column("drawings")
        batch_op.drop_column("log_scale")
