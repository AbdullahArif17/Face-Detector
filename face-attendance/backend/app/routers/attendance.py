from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.attendance import Attendance
from app.models.user import User
from app.schemas.attendance import AttendanceMark, AttendanceRead

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("", response_model=list[AttendanceRead])
async def list_attendance(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Attendance]:
    offset = (page - 1) * per_page
    result = await session.execute(
        select(Attendance)
        .where(Attendance.company_id == current_user.company_id)
        .order_by(Attendance.created_at.desc())
        .offset(offset)
        .limit(per_page),
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
    current_user: User = Depends(get_current_user),
) -> Attendance:
    attendance = Attendance(
        **payload.model_dump(exclude={"check_in", "company_id"}),
        company_id=current_user.company_id,
        check_in=payload.check_in or datetime.now(timezone.utc),
    )
    session.add(attendance)
    await session.commit()
    await session.refresh(attendance)
    return attendance
