import csv
from datetime import date, timedelta
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.time import local_day_bounds, local_now, to_local
from app.dependencies import require_role
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.user import User
from app.routers.attendance import (
    EXPORT_MAX_RECORDS,
    MANUAL_ATTENDANCE_STATUSES,
    csv_safe,
    date_bounds,
    display_date,
    display_time,
    parse_local_clock,
    today_bounds,
    working_hours,
)
from app.schemas.attendance import AttendanceManualUpdate, StaffAttendanceRecord

router = APIRouter(prefix="/attendance/staff", tags=["staff attendance"])


def build_staff_record(
    employee: Employee,
    attendance: Attendance | None,
    attendance_date: date,
) -> StaffAttendanceRecord:
    check_in = attendance.check_in if attendance is not None else None
    check_out = attendance.check_out if attendance is not None else None
    if attendance is not None and attendance.status in {"absent", "excused"}:
        check_in = None
        check_out = None

    return StaffAttendanceRecord(
        attendance_id=attendance.id if attendance is not None else None,
        employee_id=employee.id,
        employee_name=employee.name,
        designation=employee.designation,
        department=employee.department,
        check_in=check_in,
        check_out=check_out,
        status=attendance.status if attendance is not None else "absent",
        confidence_score=attendance.confidence_score if attendance is not None else None,
        notification_sent=attendance.notification_sent if attendance is not None else False,
        notification_status=attendance.notification_status if attendance is not None else None,
        working_hours=working_hours(check_in, check_out),
        attendance_date=attendance_date,
    )


@router.get("/today", response_model=list[StaffAttendanceRecord])
async def get_today_staff_attendance(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[StaffAttendanceRecord]:
    start, end = today_bounds()
    today = local_now().date()
    employees = list(
        (
            await session.scalars(
                select(Employee)
                .where(
                    Employee.company_id == current_user.company_id,
                    Employee.status == "active",
                )
                .order_by(Employee.name),
            )
        ).all(),
    )
    attendance_result = await session.execute(
        select(Attendance).where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        ),
    )
    attendance_by_employee = {
        attendance.employee_id: attendance
        for attendance in attendance_result.scalars().all()
        if attendance.employee_id is not None
    }
    return [
        build_staff_record(employee, attendance_by_employee.get(employee.id), today)
        for employee in employees
    ]


@router.get("/history", response_model=list[StaffAttendanceRecord])
async def get_staff_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    employee_id: int | None = Query(default=None, gt=0),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[StaffAttendanceRecord]:
    end_date = end_date or local_now().date()
    start_date = start_date or (end_date - timedelta(days=30))
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )
    start, end = date_bounds(start_date, end_date)
    offset = (page - 1) * per_page

    query = (
        select(Attendance, Employee)
        .join(Employee, Employee.id == Attendance.employee_id)
        .where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.desc())
        .offset(offset)
        .limit(per_page)
    )
    if employee_id is not None:
        query = query.where(Attendance.employee_id == employee_id)
    if status_filter:
        query = query.where(Attendance.status == status_filter)

    result = await session.execute(query)
    return [
        build_staff_record(employee, attendance, to_local(attendance.check_in).date())
        for attendance, employee in result.all()
    ]


@router.get("/export")
async def export_staff_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    employee_id: int | None = Query(default=None, gt=0),
    status_filter: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> StreamingResponse:
    end_date = end_date or local_now().date()
    start_date = start_date or (end_date - timedelta(days=30))
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )
    start, end = date_bounds(start_date, end_date)
    query = (
        select(Attendance, Employee)
        .join(Employee, Employee.id == Attendance.employee_id)
        .where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.desc())
        .limit(EXPORT_MAX_RECORDS + 1)
    )
    if employee_id is not None:
        query = query.where(Attendance.employee_id == employee_id)
    if status_filter:
        query = query.where(Attendance.status == status_filter)

    rows = (await session.execute(query)).all()
    if len(rows) > EXPORT_MAX_RECORDS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Export exceeds {EXPORT_MAX_RECORDS} records; narrow the date or filter range"
            ),
        )
    records = [
        build_staff_record(employee, attendance, to_local(attendance.check_in).date())
        for attendance, employee in rows
    ]

    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        ["Employee", "Designation", "Department", "Date", "Check In", "Check Out", "Status", "WhatsApp", "Working Hours"],
    )
    for record in records:
        writer.writerow(
            [
                csv_safe(record.employee_name),
                csv_safe(record.designation or ""),
                csv_safe(record.department or ""),
                record.attendance_date.isoformat(),
                display_time(record.check_in) if record.check_in else "",
                display_time(record.check_out) if record.check_out else "",
                csv_safe(record.status),
                csv_safe(record.notification_status or ""),
                csv_safe(record.working_hours),
            ],
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=staff-attendance.csv"},
    )


@router.put("/manual", response_model=StaffAttendanceRecord)
async def upsert_staff_manual_attendance(
    payload: AttendanceManualUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr", "branch_manager")),
) -> StaffAttendanceRecord:
    if payload.employee_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="employee_id is required",
        )
    status_value = payload.status.strip().lower()
    if status_value not in MANUAL_ATTENDANCE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status must be present, absent, or excused",
        )

    employee = await session.get(Employee, payload.employee_id)
    if employee is None or employee.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    day_start, day_end = local_day_bounds(payload.attendance_date)
    attendance: Attendance | None = None
    if payload.attendance_id is not None:
        attendance = await session.get(Attendance, payload.attendance_id)
        if (
            attendance is None
            or attendance.company_id != current_user.company_id
            or attendance.employee_id != employee.id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attendance record not found",
            )
        if not (day_start <= attendance.check_in < day_end):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attendance record does not belong to the selected date",
            )
    else:
        attendance = await session.scalar(
            select(Attendance)
            .where(
                Attendance.company_id == current_user.company_id,
                Attendance.employee_id == employee.id,
                Attendance.check_in >= day_start,
                Attendance.check_in < day_end,
            )
            .order_by(Attendance.check_in.desc()),
        )

    if status_value == "present":
        if payload.check_in_time is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Check-in time is required for present attendance",
            )
        check_in = parse_local_clock(payload.attendance_date, payload.check_in_time)
        check_out = (
            parse_local_clock(payload.attendance_date, payload.check_out_time)
            if payload.check_out_time
            else None
        )
        if check_out is not None and check_out <= check_in:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Check-out time must be after check-in time",
            )
    else:
        check_in = day_start
        check_out = None

    if attendance is None:
        attendance = Attendance(
            employee_id=employee.id,
            company_id=current_user.company_id,
            check_in=check_in,
        )
        session.add(attendance)

    attendance.check_in = check_in
    attendance.check_out = check_out
    attendance.status = status_value
    attendance.confidence_score = None
    attendance.notification_sent = False
    attendance.notification_status = "manual"
    await session.commit()
    await session.refresh(attendance)

    return build_staff_record(employee, attendance, payload.attendance_date)