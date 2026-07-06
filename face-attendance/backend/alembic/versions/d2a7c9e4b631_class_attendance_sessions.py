"""class attendance sessions

Revision ID: d2a7c9e4b631
Revises: f4b9c2d1e8a7
Create Date: 2026-07-03 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d2a7c9e4b631"
down_revision: str | None = "f4b9c2d1e8a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attendance_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("started_by_id", sa.Integer(), nullable=False),
        sa.Column("stopped_by_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["started_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["stopped_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_attendance_sessions_branch_id"), "attendance_sessions", ["branch_id"], unique=False)
    op.create_index(op.f("ix_attendance_sessions_company_id"), "attendance_sessions", ["company_id"], unique=False)
    op.create_index(op.f("ix_attendance_sessions_id"), "attendance_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_attendance_sessions_status"), "attendance_sessions", ["status"], unique=False)
    op.create_index(
        "ix_attendance_sessions_active_class",
        "attendance_sessions",
        ["company_id", "branch_id", "status"],
        unique=False,
    )

    op.add_column("attendance", sa.Column("session_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_attendance_session_id"), "attendance", ["session_id"], unique=False)
    op.create_foreign_key(
        "fk_attendance_session_id_attendance_sessions",
        "attendance",
        "attendance_sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_attendance_session_id_attendance_sessions", "attendance", type_="foreignkey")
    op.drop_index(op.f("ix_attendance_session_id"), table_name="attendance")
    op.drop_column("attendance", "session_id")

    op.drop_index("ix_attendance_sessions_active_class", table_name="attendance_sessions")
    op.drop_index(op.f("ix_attendance_sessions_status"), table_name="attendance_sessions")
    op.drop_index(op.f("ix_attendance_sessions_id"), table_name="attendance_sessions")
    op.drop_index(op.f("ix_attendance_sessions_company_id"), table_name="attendance_sessions")
    op.drop_index(op.f("ix_attendance_sessions_branch_id"), table_name="attendance_sessions")
    op.drop_table("attendance_sessions")
