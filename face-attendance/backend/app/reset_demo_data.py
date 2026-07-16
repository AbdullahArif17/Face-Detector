"""Reset the development database to a clean Demo School dataset.

This is intentionally destructive and intended only for local/dev data.
It preserves the Demo School company row, API key, and WhatsApp settings, but
removes old students, attendance, sessions, users except the demo admin, and
other test companies.
"""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import delete, func, or_, select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceSession
from app.models.branch import Branch
from app.models.company import Company
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.models.whatsapp_log import WhatsappLog

DEMO_SCHOOL_NAME = "Demo School"
DEMO_ADMIN_EMAIL = "admin@demo.com"
DEMO_ADMIN_PASSWORD = "admin123"

CLASSES = [
    {"name": "Class 10-A", "grade": "Class 10", "section": "A"},
    {"name": "Class 9-B", "grade": "Class 9", "section": "B"},
    {"name": "Class 8-C", "grade": "Class 8", "section": "C"},
]

STUDENTS = [
    {
        "student_name": "Ayesha Khan",
        "student_code": "DS-1001",
        "grade": "Class 10",
        "section": "A",
        "parent_name": "Saad Khan",
        "parent_phone": "923001234567",
        "status": "present",
        "check_in": time(hour=8, minute=3),
        "check_out": None,
        "avatar_color": "#2563eb",
        "confidence_score": 0.94,
    },
    {
        "student_name": "Muhammad Ali",
        "student_code": "DS-1002",
        "grade": "Class 10",
        "section": "A",
        "parent_name": "Farah Ali",
        "parent_phone": "923011234567",
        "status": "late",
        "check_in": time(hour=9, minute=18),
        "check_out": None,
        "avatar_color": "#7c3aed",
        "confidence_score": 0.9,
    },
    {
        "student_name": "Noor Fatima",
        "student_code": "DS-1003",
        "grade": "Class 10",
        "section": "A",
        "parent_name": "Bilal Fatima",
        "parent_phone": "923021234567",
        "status": "present",
        "check_in": time(hour=8, minute=10),
        "check_out": time(hour=13, minute=55),
        "avatar_color": "#0891b2",
        "confidence_score": 0.92,
    },
    {
        "student_name": "Hamza Ahmed",
        "student_code": "DS-2001",
        "grade": "Class 9",
        "section": "B",
        "parent_name": "Usman Ahmed",
        "parent_phone": "923031234567",
        "status": "present",
        "check_in": time(hour=8, minute=7),
        "check_out": None,
        "avatar_color": "#16a34a",
        "confidence_score": 0.91,
    },
    {
        "student_name": "Zara Malik",
        "student_code": "DS-2002",
        "grade": "Class 9",
        "section": "B",
        "parent_name": "Sana Malik",
        "parent_phone": "923041234567",
        "status": "absent",
        "check_in": None,
        "check_out": None,
        "avatar_color": "#db2777",
        "confidence_score": None,
    },
    {
        "student_name": "Bilal Hussain",
        "student_code": "DS-2003",
        "grade": "Class 9",
        "section": "B",
        "parent_name": "Nadia Hussain",
        "parent_phone": "923051234567",
        "status": "present",
        "check_in": time(hour=8, minute=1),
        "check_out": None,
        "avatar_color": "#ea580c",
        "confidence_score": 0.93,
    },
    {
        "student_name": "Minal Sheikh",
        "student_code": "DS-3001",
        "grade": "Class 8",
        "section": "C",
        "parent_name": "Asim Sheikh",
        "parent_phone": "923061234567",
        "status": "late",
        "check_in": time(hour=9, minute=24),
        "check_out": None,
        "avatar_color": "#4f46e5",
        "confidence_score": 0.89,
    },
    {
        "student_name": "Danish Raza",
        "student_code": "DS-3002",
        "grade": "Class 8",
        "section": "C",
        "parent_name": "Hira Raza",
        "parent_phone": "923071234567",
        "status": "absent",
        "check_in": None,
        "check_out": None,
        "avatar_color": "#0f766e",
        "confidence_score": None,
    },
]


def avatar_data_url(name: str, background_color: str) -> str:
    initials = "".join(part[0] for part in name.split()[:2]).upper()
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="80" fill="{background_color}"/>
      <circle cx="80" cy="62" r="32" fill="rgba(255,255,255,0.28)"/>
      <path d="M30 142c10-32 31-48 50-48s40 16 50 48" fill="rgba(255,255,255,0.28)"/>
      <text x="80" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="white">{initials}</text>
    </svg>
    """.strip()
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


async def get_or_create_demo_school(session) -> Company:
    demo_schools = list(
        (
            await session.scalars(
                select(Company)
                .where(func.lower(func.trim(Company.name)) == DEMO_SCHOOL_NAME.lower())
                .order_by(Company.id),
            )
        ).all(),
    )
    if demo_schools:
        school = demo_schools[0]
    else:
        school = Company(
            name=DEMO_SCHOOL_NAME,
            package="starter",
            employee_limit=500,
            status="active",
            school_phone="923001111111",
        )
        session.add(school)
        await session.flush()

    school.name = DEMO_SCHOOL_NAME
    school.package = "starter"
    school.employee_limit = 500
    school.status = "active"
    school.school_phone = school.school_phone or "923001111111"
    return school


async def clear_old_data(session, school_id: int) -> None:
    company_ids = list((await session.scalars(select(Company.id))).all())
    if not company_ids:
        return

    await session.execute(delete(WhatsappLog).where(WhatsappLog.school_id.in_(company_ids)))
    await session.execute(delete(Attendance).where(Attendance.company_id.in_(company_ids)))
    await session.execute(
        delete(FaceEmbedding).where(
            FaceEmbedding.student_id.in_(
                select(Student.id).where(Student.school_id.in_(company_ids)),
            ),
        ),
    )
    await session.execute(
        delete(AttendanceSession).where(AttendanceSession.company_id.in_(company_ids)),
    )
    await session.execute(delete(Student).where(Student.school_id.in_(company_ids)))
    await session.execute(delete(Employee).where(Employee.company_id.in_(company_ids)))
    await session.execute(delete(Branch).where(Branch.company_id.in_(company_ids)))
    await session.execute(
        delete(User).where(
            or_(
                User.company_id != school_id,
                func.lower(User.email) != DEMO_ADMIN_EMAIL,
            ),
        ),
    )
    await session.execute(delete(Company).where(Company.id != school_id))


async def ensure_demo_admin(session, school_id: int) -> User:
    admin = await session.scalar(
        select(User).where(
            User.company_id == school_id,
            func.lower(User.email) == DEMO_ADMIN_EMAIL,
        ),
    )
    if admin is None:
        admin = User(
            name="Admin",
            email=DEMO_ADMIN_EMAIL,
            password_hash=hash_password(DEMO_ADMIN_PASSWORD),
            role="super_admin",
            company_id=school_id,
            is_active=True,
        )
        session.add(admin)
        await session.flush()
    else:
        admin.name = "Admin"
        admin.email = DEMO_ADMIN_EMAIL
        admin.password_hash = hash_password(DEMO_ADMIN_PASSWORD)
        admin.role = "super_admin"
        admin.company_id = school_id
        admin.is_active = True
    return admin


async def seed_fresh_school_data(session, school: Company, admin: User) -> None:
    class_by_key: dict[tuple[str, str], Branch] = {}
    for class_data in CLASSES:
        school_class = Branch(
            company_id=school.id,
            name=class_data["name"],
            location=f"{class_data['grade']} Section {class_data['section']}",
        )
        session.add(school_class)
        await session.flush()
        class_by_key[(class_data["grade"], class_data["section"])] = school_class

    today = datetime.now(timezone.utc).date()
    active_class = class_by_key[("Class 10", "A")]
    stopped_class = class_by_key[("Class 9", "B")]
    active_session = AttendanceSession(
        company_id=school.id,
        branch_id=active_class.id,
        started_by_id=admin.id,
        status="active",
        started_at=datetime.combine(today, time(hour=8), tzinfo=timezone.utc),
    )
    stopped_session = AttendanceSession(
        company_id=school.id,
        branch_id=stopped_class.id,
        started_by_id=admin.id,
        stopped_by_id=admin.id,
        status="stopped",
        started_at=datetime.combine(today, time(hour=8), tzinfo=timezone.utc),
        stopped_at=datetime.combine(today, time(hour=9), tzinfo=timezone.utc),
    )
    session.add_all([active_session, stopped_session])
    await session.flush()

    session_by_class = {
        ("Class 10", "A"): active_session,
        ("Class 9", "B"): stopped_session,
    }

    for student_data in STUDENTS:
        school_class = class_by_key[(student_data["grade"], student_data["section"])]
        student = Student(
            school_id=school.id,
            class_id=school_class.id,
            student_name=student_data["student_name"],
            student_code=student_data["student_code"],
            grade=student_data["grade"],
            section=student_data["section"],
            parent_name=student_data["parent_name"],
            parent_phone=student_data["parent_phone"],
            profile_image=avatar_data_url(
                student_data["student_name"],
                student_data["avatar_color"],
            ),
            status="active",
        )
        session.add(student)
        await session.flush()

        if student_data["check_in"] is None:
            continue

        check_in = datetime.combine(
            today,
            student_data["check_in"],
            tzinfo=timezone.utc,
        )
        check_out = (
            datetime.combine(today, student_data["check_out"], tzinfo=timezone.utc)
            if student_data["check_out"] is not None
            else None
        )
        class_session = session_by_class.get(
            (student_data["grade"], student_data["section"]),
        )
        session.add(
            Attendance(
                student_id=student.id,
                company_id=school.id,
                session_id=class_session.id if class_session is not None else None,
                check_in=check_in,
                check_out=check_out,
                status=student_data["status"],
                confidence_score=student_data["confidence_score"],
                notification_sent=False,
                notification_status=None,
                created_at=check_in + timedelta(minutes=1),
            ),
        )


async def reset_demo_data() -> None:
    async with SessionLocal() as session:
        async with session.begin():
            school = await get_or_create_demo_school(session)
            await clear_old_data(session, school.id)
            admin = await ensure_demo_admin(session, school.id)
            await seed_fresh_school_data(session, school, admin)

    print("Development data reset complete.")
    print(f"Organization: {DEMO_SCHOOL_NAME}")
    print(f"Login email: {DEMO_ADMIN_EMAIL}")
    print(f"Password: {DEMO_ADMIN_PASSWORD}")
    print(f"Classes: {len(CLASSES)}")
    print(f"Students: {len(STUDENTS)}")
    print("Face embeddings: 0; re-enroll real faces for ArcFace recognition.")


if __name__ == "__main__":
    asyncio.run(reset_demo_data())
