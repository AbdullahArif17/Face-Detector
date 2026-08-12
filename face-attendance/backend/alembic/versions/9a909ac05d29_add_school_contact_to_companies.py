"""add school_contact to companies

Revision ID: 9a909ac05d29
Revises: 8b0ac05d29be
Create Date: 2026-08-12 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "9a909ac05d29"
down_revision: str | None = "8b0ac05d29be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("school_contact", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "school_contact")
