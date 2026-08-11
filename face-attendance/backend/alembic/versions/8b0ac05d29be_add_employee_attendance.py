"""add employee (teacher/staff) attendance

Revision ID: 8b0ac05d29be
Revises: 35f101730b0f
Create Date: 2026-08-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "8b0ac05d29be"
down_revision: str | None = "35f101730b0f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Employees use the same attendance_sessions as students; a check-in/out
    # session may now mark either a student or an employee.
    op.add_column("attendance", sa.Column("employee_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_attendance_employee_id_employees",
        "attendance",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_attendance_employee_id", "attendance", ["employee_id"])
    op.create_index(
        "uq_attendance_one_mark_per_session_employee",
        "attendance",
        ["session_id", "employee_id"],
        unique=True,
        postgresql_where=sa.text("session_id IS NOT NULL"),
    )
    op.alter_column("attendance", "student_id", existing_type=sa.Integer(), nullable=True)

    op.add_column("face_embeddings", sa.Column("employee_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_face_embeddings_employee_id_employees",
        "face_embeddings",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_face_embeddings_employee_id", "face_embeddings", ["employee_id"], unique=True)
    op.alter_column(
        "face_embeddings",
        "student_id",
        existing_type=sa.Integer(),
        nullable=True,
    )

    # Staff notifications go to the school number; whatsapp_logs must track
    # the employee subject instead of a student.
    op.add_column("whatsapp_logs", sa.Column("employee_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_whatsapp_logs_employee_id_employees",
        "whatsapp_logs",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_whatsapp_logs_employee_id", "whatsapp_logs", ["employee_id"])
    op.alter_column("whatsapp_logs", "student_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("whatsapp_logs", "student_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_whatsapp_logs_employee_id", table_name="whatsapp_logs")
    op.drop_constraint(
        "fk_whatsapp_logs_employee_id_employees",
        "whatsapp_logs",
        type_="foreignkey",
    )
    op.drop_column("whatsapp_logs", "employee_id")

    op.alter_column(
        "face_embeddings",
        "student_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_index("ix_face_embeddings_employee_id", table_name="face_embeddings")
    op.drop_constraint(
        "fk_face_embeddings_employee_id_employees",
        "face_embeddings",
        type_="foreignkey",
    )
    op.drop_column("face_embeddings", "employee_id")

    op.alter_column("attendance", "student_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index(
        "uq_attendance_one_mark_per_session_employee",
        table_name="attendance",
    )
    op.drop_index("ix_attendance_employee_id", table_name="attendance")
    op.drop_constraint(
        "fk_attendance_employee_id_employees",
        "attendance",
        type_="foreignkey",
    )
    op.drop_column("attendance", "employee_id")