"""school attendance schedule

Revision ID: a7e2d5c8f310
Revises: f9c4b7a2d105
Create Date: 2026-07-11 00:20:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a7e2d5c8f310"
down_revision: str | None = "f9c4b7a2d105"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column(
            "attendance_start_time",
            sa.String(length=5),
            nullable=False,
            server_default="09:00",
        ),
    )
    op.add_column(
        "companies",
        sa.Column(
            "late_grace_minutes",
            sa.Integer(),
            nullable=False,
            server_default="15",
        ),
    )
    op.alter_column("companies", "attendance_start_time", server_default=None)
    op.alter_column("companies", "late_grace_minutes", server_default=None)


def downgrade() -> None:
    op.drop_column("companies", "late_grace_minutes")
    op.drop_column("companies", "attendance_start_time")
