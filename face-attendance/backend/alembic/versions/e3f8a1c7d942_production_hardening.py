"""production hardening

Revision ID: e3f8a1c7d942
Revises: d2a7c9e4b631
Create Date: 2026-07-11 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e3f8a1c7d942"
down_revision: str | None = "d2a7c9e4b631"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("face_embeddings", "embedding_vector", nullable=True)
    op.add_column(
        "face_embeddings",
        sa.Column("embedding_ciphertext", sa.Text(), nullable=True),
    )

    op.add_column(
        "whatsapp_logs",
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    op.create_table(
        "whatsapp_inbound_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meta_message_id", sa.String(length=255), nullable=False),
        sa.Column("school_id", sa.Integer(), nullable=True),
        sa.Column("student_id", sa.Integer(), nullable=True),
        sa.Column("phone_number_id", sa.String(length=100), nullable=False),
        sa.Column("sender_phone", sa.String(length=20), nullable=False),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["companies.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meta_message_id"),
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_created_at"),
        "whatsapp_inbound_messages",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_id"),
        "whatsapp_inbound_messages",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_meta_message_id"),
        "whatsapp_inbound_messages",
        ["meta_message_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_phone_number_id"),
        "whatsapp_inbound_messages",
        ["phone_number_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_school_id"),
        "whatsapp_inbound_messages",
        ["school_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_sender_phone"),
        "whatsapp_inbound_messages",
        ["sender_phone"],
        unique=False,
    )
    op.create_index(
        op.f("ix_whatsapp_inbound_messages_student_id"),
        "whatsapp_inbound_messages",
        ["student_id"],
        unique=False,
    )

    op.create_index(
        "uq_attendance_sessions_one_active_class",
        "attendance_sessions",
        ["company_id", "branch_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active' AND stopped_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_attendance_sessions_one_active_class",
        table_name="attendance_sessions",
        postgresql_where=sa.text("status = 'active' AND stopped_at IS NULL"),
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_student_id"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_sender_phone"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_school_id"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_phone_number_id"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_meta_message_id"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_id"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_index(
        op.f("ix_whatsapp_inbound_messages_created_at"),
        table_name="whatsapp_inbound_messages",
    )
    op.drop_table("whatsapp_inbound_messages")
    op.drop_column("whatsapp_logs", "error_message")
    op.drop_column("face_embeddings", "embedding_ciphertext")
    op.alter_column("face_embeddings", "embedding_vector", nullable=False)
