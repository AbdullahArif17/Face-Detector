"""one attendance mark per student and session

Revision ID: c1d4e7f9a620
Revises: a7e2d5c8f310
Create Date: 2026-07-16 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c1d4e7f9a620"
down_revision: str | None = "a7e2d5c8f310"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Keep the earliest mark if historical retries created duplicates before
    # the database constraint existed.
    op.execute(
        sa.text(
            """
            DELETE FROM attendance AS duplicate
            USING attendance AS original
            WHERE duplicate.session_id IS NOT NULL
              AND duplicate.session_id = original.session_id
              AND duplicate.student_id = original.student_id
              AND duplicate.id > original.id
            """,
        ),
    )
    op.create_index(
        "uq_attendance_one_mark_per_session",
        "attendance",
        ["session_id", "student_id"],
        unique=True,
        postgresql_where=sa.text("session_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_attendance_one_mark_per_session",
        table_name="attendance",
    )
