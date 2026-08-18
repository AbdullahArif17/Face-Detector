"""add check_in_end_time and check_out_end_time to companies

Revision ID: g1h2i3j4k5l6
Revises: f1e2d3c4b5a6
Create Date: 2026-08-18 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "g1h2i3j4k5l6"
down_revision: str | None = "f1e2d3c4b5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("check_in_end_time", sa.String(5), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("check_out_end_time", sa.String(5), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "check_out_end_time")
    op.drop_column("companies", "check_in_end_time")
