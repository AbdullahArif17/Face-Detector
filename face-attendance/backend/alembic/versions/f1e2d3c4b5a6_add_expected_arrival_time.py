"""add expected_arrival_time to employees

Revision ID: f1e2d3c4b5a6
Revises: d1b70a2ff4a5
Create Date: 2026-08-17 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f1e2d3c4b5a6"
down_revision: str | None = "d1b70a2ff4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("expected_arrival_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "attendance",
        sa.Column("checkin_status", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("attendance", "checkin_status")
    op.drop_column("employees", "expected_arrival_time")