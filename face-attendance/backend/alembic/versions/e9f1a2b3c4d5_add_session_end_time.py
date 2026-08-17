"""add session_end_time to attendance_sessions

Revision ID: e9f1a2b3c4d5
Revises: 8b0ac05d29be
Create Date: 2026-08-17 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e9f1a2b3c4d5"
down_revision: str | None = "8b0ac05d29be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "attendance_sessions",
        sa.Column("session_end_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_attendance_sessions_end_time",
        "attendance_sessions",
        ["session_end_time"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_sessions_end_time", table_name="attendance_sessions")
    op.drop_column("attendance_sessions", "session_end_time")