"""tenant scoped user email

Revision ID: f4b9c2d1e8a7
Revises: a0ddfb82a57e
Create Date: 2026-06-29 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = "f4b9c2d1e8a7"
down_revision: str | None = "a0ddfb82a57e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_unique_constraint(
        "uq_users_company_email",
        "users",
        ["company_id", "email"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_company_email", "users", type_="unique")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
