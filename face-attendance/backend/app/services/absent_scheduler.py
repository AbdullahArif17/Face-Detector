from datetime import datetime, time, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.attendance import Attendance
from app.models.company import Company
from app.models.student import Student
from app.services.whatsapp import (
    absent_message_body,
    get_whatsapp_credentials,
    log_whatsapp_message,
    send_absent_message,
    school_phone_or_default,
)


def today_bounds() -> tuple[datetime, datetime]:
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end


async def send_absent_alerts() -> None:
    start, end = today_bounds()
    date_str = start.strftime("%d %b %Y")

    async with SessionLocal() as session:
        schools = list(
            (
                await session.execute(
                    select(Company).where(Company.status == "active").order_by(Company.id),
                )
            )
            .scalars()
            .all(),
        )

        for school in schools:
            credentials = get_whatsapp_credentials(school)
            students = list(
                (
                    await session.execute(
                        select(Student).where(
                            Student.school_id == school.id,
                            Student.status == "active",
                        ),
                    )
                )
                .scalars()
                .all(),
            )

            for student in students:
                existing_attendance = await session.scalar(
                    select(Attendance).where(
                        Attendance.company_id == school.id,
                        Attendance.student_id == student.id,
                        Attendance.check_in >= start,
                        Attendance.check_in < end,
                    ),
                )
                if existing_attendance is not None:
                    continue

                attendance = Attendance(
                    student_id=student.id,
                    company_id=school.id,
                    check_in=datetime.now(timezone.utc),
                    status="absent",
                    notification_sent=False,
                    notification_status=None,
                )
                session.add(attendance)
                await session.flush()

                access_token, phone_number_id = credentials
                if not access_token or not phone_number_id:
                    continue

                message_body = absent_message_body(student, school, date_str)
                result = await send_absent_message(
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    parent_phone=student.parent_phone,
                    parent_name=student.parent_name,
                    school_name=school.name,
                    school_phone=school_phone_or_default(school),
                    student_name=student.student_name,
                    date_str=date_str,
                )
                message_status = "sent" if result["success"] else "failed"
                attendance.notification_sent = result["success"] is True
                attendance.notification_status = message_status
                await log_whatsapp_message(
                    session,
                    school_id=school.id,
                    student_id=student.id,
                    parent_phone=student.parent_phone,
                    message_type="absent",
                    message_body=message_body,
                    status=message_status,
                    meta_message_id=result["message_id"]
                    if isinstance(result["message_id"], str)
                    else None,
                )

        await session.commit()


def create_absent_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=timezone.utc)
    scheduler.add_job(send_absent_alerts, "cron", hour=9, minute=0, id="absent-alerts")
    return scheduler
