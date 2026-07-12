from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.models.company import Company
from app.models.student import Student
from app.core.time import local_day_bounds, local_now
from app.services.whatsapp import (
    absent_message_body,
    get_whatsapp_credentials,
    log_whatsapp_message,
    send_absent_message,
    school_phone_or_default,
)


def today_bounds() -> tuple[datetime, datetime]:
    return local_day_bounds()


async def send_absent_alerts(session: AsyncSession) -> dict[str, Any]:
    """
    Send WhatsApp absent alerts for active students without today's attendance.

    This function is called by Vercel Cron through `/api/cron/absent-alerts`.
    It intentionally has no APScheduler dependency so it works in serverless.
    """
    start, end = today_bounds()
    now = datetime.now(timezone.utc)
    date_str = local_now().strftime("%A, %d %B %Y")
    results: dict[str, Any] = {
        "processed": 0,
        "sent": 0,
        "failed": 0,
        "skipped": 0,
        "schools": [],
    }

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
        school_result = {
            "school_id": school.id,
            "school": school.name,
            "absent": 0,
            "sent": 0,
            "failed": 0,
            "skipped": 0,
        }
        access_token, phone_number_id = get_whatsapp_credentials(school)

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

        checked_in_ids = set(
            (
                await session.execute(
                    select(Attendance.student_id).where(
                        Attendance.company_id == school.id,
                        Attendance.check_in >= start,
                        Attendance.check_in < end,
                    ),
                )
            )
            .scalars()
            .all(),
        )
        absent_students = [student for student in students if student.id not in checked_in_ids]
        school_result["absent"] = len(absent_students)

        for student in absent_students:
            attendance = Attendance(
                student_id=student.id,
                company_id=school.id,
                check_in=now,
                status="absent",
                notification_sent=False,
                notification_status=None,
            )
            session.add(attendance)
            await session.flush()

            results["processed"] += 1

            if not access_token or not phone_number_id:
                attendance.notification_status = "skipped"
                results["skipped"] += 1
                school_result["skipped"] += 1
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
                error_message=result["error"]
                if isinstance(result["error"], str)
                else None,
            )

            if result["success"]:
                results["sent"] += 1
                school_result["sent"] += 1
            else:
                results["failed"] += 1
                school_result["failed"] += 1

        results["schools"].append(school_result)

    await session.commit()
    return results
