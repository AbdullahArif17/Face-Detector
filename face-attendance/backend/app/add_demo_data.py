"""Add synthetic students and attendance history without resetting Demo School."""

import asyncio
import base64
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal
from app.core.time import local_day_bounds, local_now
from app.models.attendance import Attendance
from app.models.branch import Branch
from app.models.company import Company
from app.models.student import Student
from app.models.user import User

DEMO_SCHOOL_NAME = "Demo School"
DEMO_ADMIN_EMAIL = "admin@demo.com"
HISTORY_SCHOOL_DAYS = 7


@dataclass(frozen=True)
class DemoStudent:
    name: str
    code: str
    grade: str
    section: str
    guardian: str
    phone: str
    color: str


DEMO_STUDENTS = (
    DemoStudent("Sara Iqbal", "DEMO-4001", "Class 10", "A", "Demo Guardian 01", "923990100001", "#2563eb"),
    DemoStudent("Omar Farooq", "DEMO-4002", "Class 10", "A", "Demo Guardian 02", "923990100002", "#7c3aed"),
    DemoStudent("Hania Siddiqui", "DEMO-4003", "Class 9", "B", "Demo Guardian 03", "923990100003", "#0891b2"),
    DemoStudent("Ali Raza", "DEMO-4004", "Class 9", "B", "Demo Guardian 04", "923990100004", "#16a34a"),
    DemoStudent("Maryam Noor", "DEMO-4005", "Class 9", "C", "Demo Guardian 05", "923990100005", "#db2777"),
    DemoStudent("Zain Abbas", "DEMO-4006", "Class 9", "C", "Demo Guardian 06", "923990100006", "#ea580c"),
    DemoStudent("Iman Sheikh", "DEMO-4007", "Class 8", "C", "Demo Guardian 07", "923990100007", "#4f46e5"),
    DemoStudent("Ahmed Hassan", "DEMO-4008", "Class 8", "C", "Demo Guardian 08", "923990100008", "#0f766e"),
    DemoStudent("Laiba Khan", "DEMO-4009", "Class 7", "A", "Demo Guardian 09", "923990100009", "#9333ea"),
    DemoStudent("Rayyan Malik", "DEMO-4010", "Class 7", "A", "Demo Guardian 10", "923990100010", "#0284c7"),
    DemoStudent("Anaya Ahmed", "DEMO-4011", "Class 7", "A", "Demo Guardian 11", "923990100011", "#be123c"),
    DemoStudent("Ibrahim Shah", "DEMO-4012", "Class 6", "B", "Demo Guardian 12", "923990100012", "#15803d"),
    DemoStudent("Mahnoor Fatima", "DEMO-4013", "Class 6", "B", "Demo Guardian 13", "923990100013", "#c2410c"),
    DemoStudent("Daniyal Qureshi", "DEMO-4014", "Class 6", "B", "Demo Guardian 14", "923990100014", "#0369a1"),
    DemoStudent("Eman Tariq", "DEMO-4015", "Class 6", "B", "Demo Guardian 15", "923990100015", "#6d28d9"),
)


def avatar_data_url(name: str, background_color: str) -> str:
    initials = "".join(part[0] for part in name.split()[:2]).upper()
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="80" fill="{background_color}"/>
      <circle cx="80" cy="62" r="32" fill="rgba(255,255,255,0.24)"/>
      <path d="M30 142c10-32 31-48 50-48s40 16 50 48" fill="rgba(255,255,255,0.24)"/>
      <text x="80" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="white">{initials}</text>
    </svg>
    """.strip()
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def recent_school_days(today: date, count: int) -> list[date]:
    school_days: list[date] = []
    cursor = today
    while len(school_days) < count:
        if cursor.weekday() < 5:
            school_days.append(cursor)
        cursor -= timedelta(days=1)
    return school_days


async def get_demo_school(session: AsyncSession) -> Company:
    school = await session.scalar(
        select(Company)
        .join(User, User.company_id == Company.id)
        .where(
            func.lower(func.trim(Company.name)) == DEMO_SCHOOL_NAME.lower(),
            func.lower(User.email) == DEMO_ADMIN_EMAIL,
        )
        .order_by(Company.id),
    )
    if school is None:
        raise RuntimeError(
            "Demo School admin account was not found. Run the base seed first.",
        )
    return school


async def get_or_create_class(
    session: AsyncSession,
    *,
    school_id: int,
    grade: str,
    section: str,
) -> tuple[Branch, bool]:
    class_name = f"{grade}-{section}"
    school_class = await session.scalar(
        select(Branch).where(
            Branch.company_id == school_id,
            Branch.name == class_name,
        ),
    )
    if school_class is not None:
        return school_class, False

    school_class = Branch(
        company_id=school_id,
        name=class_name,
        location=f"{grade} - Room {section}",
    )
    session.add(school_class)
    await session.flush()
    return school_class, True


async def add_demo_data() -> None:
    created_classes = 0
    created_students = 0
    created_attendance = 0

    async with SessionLocal() as session:
        async with session.begin():
            school = await get_demo_school(session)
            school_days = recent_school_days(local_now().date(), HISTORY_SCHOOL_DAYS)

            for student_index, demo in enumerate(DEMO_STUDENTS, start=1):
                school_class, class_created = await get_or_create_class(
                    session,
                    school_id=school.id,
                    grade=demo.grade,
                    section=demo.section,
                )
                created_classes += int(class_created)

                student = await session.scalar(
                    select(Student).where(
                        Student.school_id == school.id,
                        Student.student_code == demo.code,
                    ),
                )
                if student is None:
                    student = Student(
                        school_id=school.id,
                        class_id=school_class.id,
                        student_name=demo.name,
                        student_code=demo.code,
                        grade=demo.grade,
                        section=demo.section,
                        parent_name=demo.guardian,
                        parent_phone=demo.phone,
                        status="active",
                    )
                    session.add(student)
                    await session.flush()
                    created_students += 1
                else:
                    student.class_id = school_class.id
                    student.status = "active"

                student.profile_image = avatar_data_url(demo.name, demo.color)

                for day_index, school_day in enumerate(school_days):
                    day_start, day_end = local_day_bounds(school_day)
                    existing_attendance_id = await session.scalar(
                        select(Attendance.id).where(
                            Attendance.student_id == student.id,
                            Attendance.company_id == school.id,
                            Attendance.check_in >= day_start,
                            Attendance.check_in < day_end,
                        ),
                    )
                    if existing_attendance_id is not None:
                        continue

                    pattern = (student_index * 3 + day_index * 2) % 10
                    if pattern in {0, 1}:
                        # No row means absent in the daily dashboard contract.
                        continue

                    is_late = pattern == 2
                    if is_late:
                        check_in = day_start + timedelta(
                            hours=9,
                            minutes=16 + (student_index % 12),
                        )
                    else:
                        check_in = day_start + timedelta(
                            hours=8,
                            minutes=student_index * 3 % 48,
                        )
                    check_out = check_in + timedelta(
                        hours=5,
                        minutes=20 + (student_index % 25),
                    )
                    confidence = 0.88 + ((student_index + day_index) % 9) / 100
                    session.add(
                        Attendance(
                            student_id=student.id,
                            company_id=school.id,
                            check_in=check_in,
                            check_out=check_out,
                            status="late" if is_late else "present",
                            confidence_score=round(confidence, 2),
                            notification_sent=False,
                        ),
                    )
                    created_attendance += 1

    print("Additional Demo School data is ready.")
    print(f"Classes created: {created_classes}")
    print(f"Students created: {created_students}")
    print(f"Attendance rows created: {created_attendance}")
    print("No face embeddings or WhatsApp messages were created.")


if __name__ == "__main__":
    asyncio.run(add_demo_data())
