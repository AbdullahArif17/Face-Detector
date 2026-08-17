"""merge heads

Revision ID: d1b70a2ff4a5
Revises: 9a909ac05d29, e9f1a2b3c4d5
Create Date: 2026-08-17 12:50:17.456446
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd1b70a2ff4a5'
down_revision: str | None = ('9a909ac05d29', 'e9f1a2b3c4d5')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
