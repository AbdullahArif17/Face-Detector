"""Phase 4 user management and kiosk API keys

Revision ID: b7c4d9e8f012
Revises: 9428e714984a
Create Date: 2026-06-28 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b7c4d9e8f012"
down_revision: str | None = "9428e714984a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("api_key", sa.String(length=255), nullable=True))
    op.execute(
        """
        UPDATE companies
        SET api_key = concat(
            'legacy_',
            id::text,
            '_',
            md5(random()::text || clock_timestamp()::text)
        )
        WHERE api_key IS NULL
        """,
    )
    op.alter_column("companies", "api_key", nullable=False)
    op.create_index(op.f("ix_companies_api_key"), "companies", ["api_key"], unique=True)

    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column("users", sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("users", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "last_login")
    op.drop_column("users", "is_active")
    op.drop_index(op.f("ix_companies_api_key"), table_name="companies")
    op.drop_column("companies", "api_key")
