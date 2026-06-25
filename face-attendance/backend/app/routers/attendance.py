from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.attendance import Attendance
from app.schemas.attendance import AttendanceMark, AttendanceRead

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("", response_model=list[AttendanceRead])
async def list_attendance(
    session: AsyncSession = Depends(get_db),
) -> list[Attendance]:
    result = await session.execute(
        select(Attendance).order_by(Attendance.created_at.desc()),
    )
    return list(result.scalars().all())


@router.post(
    "/mark",
    response_model=AttendanceRead,
    status_code=status.HTTP_201_CREATED,
)
async def mark_attendance(
    payload: AttendanceMark,
    session: AsyncSession = Depends(get_db),
) -> Attendance:
    attendance = Attendance(
        **payload.model_dump(exclude={"check_in"}),
        check_in=payload.check_in or datetime.now(timezone.utc),
    )
    session.add(attendance)
    await session.commit()
    await session.refresh(attendance)
    return attendance
