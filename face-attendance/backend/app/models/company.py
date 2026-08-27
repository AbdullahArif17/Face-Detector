from datetime import datetime, timezone
import secrets

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    package: Mapped[str] = mapped_column(String(100), default="starter", nullable=False)
    employee_limit: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    school_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    school_contact: Mapped[str | None] = mapped_column(String(50), nullable=True)
    school_logo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Retained for zero-downtime compatibility with older deployments. Runtime
    # attendance is session-driven and does not read these legacy values.
    absent_alert_time: Mapped[str] = mapped_column(String(5), default="09:00", nullable=False)
    attendance_start_time: Mapped[str] = mapped_column(
        String(5),
        default="09:00",
        nullable=False,
    )
    check_in_end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    check_out_end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    late_grace_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    default_session_duration_minutes: Mapped[int] = mapped_column(Integer, default=60, server_default="60", nullable=False)
    api_key: Mapped[str] = mapped_column(
        String(255),
        default=lambda: secrets.token_urlsafe(32),
        unique=True,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
