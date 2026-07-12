"""remove redundant inbound message unique constraint

Revision ID: f9c4b7a2d105
Revises: e3f8a1c7d942
Create Date: 2026-07-11 00:10:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = "f9c4b7a2d105"
down_revision: str | None = "e3f8a1c7d942"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "whatsapp_inbound_messages_meta_message_id_key",
        "whatsapp_inbound_messages",
        type_="unique",
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "whatsapp_inbound_messages_meta_message_id_key",
        "whatsapp_inbound_messages",
        ["meta_message_id"],
    )
