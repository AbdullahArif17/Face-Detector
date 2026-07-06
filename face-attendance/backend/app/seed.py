"""Create demo school data for local development."""

import asyncio
import base64
from datetime import datetime, time, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.attendance import Attendance
from app.models.branch import Branch
from app.models.company import Company
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User

DEMO_SCHOOL_NAME = "Demo School"
DEMO_ADMIN_EMAIL = "admin@demo.com"
DEMO_ADMIN_PASSWORD = "admin123"

DEMO_STUDENTS = [
    {
        "student_name": "Ayan Khan",
        "student_code": "R-1001",
        "grade": "Class 10",
        "section": "A",
        "parent_name": "Mr. Khan",
        "parent_phone": "923001234567",
        "attendance_status": "present",
        "confidence_score": 0.96,
        "has_demo_face": True,
        "avatar_color": "#2563eb",
    },
    {
        "student_name": "Fatima Ali",
        "student_code": "R-1002",
        "grade": "Class 10",
        "section": "A",
        "parent_name": "Mrs. Ali",
        "parent_phone": "923011234567",
        "attendance_status": "late",
        "confidence_score": 0.91,
        "has_demo_face": True,
        "avatar_color": "#7c3aed",
    },
    {
        "student_name": "Hamza Ahmed",
        "student_code": "R-1003",
        "grade": "Class 9",
        "section": "B",
        "parent_name": "Mr. Ahmed",
        "parent_phone": "923021234567",
        "attendance_status": "present",
        "confidence_score": 0.94,
        "has_demo_face": True,
        "avatar_color": "#0891b2",
    },
    {
        "student_name": "Zara Malik",
        "student_code": "R-1004",
        "grade": "Class 8",
        "section": "C",
        "parent_name": "Mrs. Malik",
        "parent_phone": "923031234567",
        "attendance_status": "absent",
        "confidence_score": None,
        "has_demo_face": False,
        "avatar_color": "#db2777",
    },
    {
        "student_name": "Bilal Hussain",
        "student_code": "R-1005",
        "grade": "Class 7",
        "section": "A",
        "parent_name": "Mr. Hussain",
        "parent_phone": "923041234567",
        "attendance_status": "present",
        "confidence_score": 0.89,
        "has_demo_face": False,
        "avatar_color": "#ea580c",
    },
]


def demo_embedding_vector(seed: int, dimensions: int = 128) -> list[float]:
    """Return a deterministic non-biometric placeholder vector for demo UI state."""
    vector = [0.0] * dimensions
    vector[seed % dimensions] = 1.0
    return vector


def demo_avatar_data_url(name: str, background_color: str) -> str:
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


async def get_or_create_class(
    session,
    *,
    school_id: int,
    grade: str,
    section: str,
) -> Branch:
    class_name = f"{grade}-{section}"
    school_class = await session.scalar(
        select(Branch).where(
            Branch.company_id == school_id,
            Branch.name == class_name,
        ),
    )
    if school_class is not None:
        return school_class

    school_class = Branch(company_id=school_id, name=class_name, location="Classroom")
    session.add(school_class)
    await session.flush()
    return school_class


async def seed() -> None:
    async with SessionLocal() as session:
        async with session.begin():
            school = await session.scalar(
                select(Company).where(Company.name == DEMO_SCHOOL_NAME),
            )
            if school is None:
                school = Company(
                    name=DEMO_SCHOOL_NAME,
                    package="starter",
                    employee_limit=500,
                    status="active",
                    school_phone="923001111111",
                    absent_alert_time="09:00",
                )
                session.add(school)
                await session.flush()

            user = await session.scalar(
                select(User).where(User.email == DEMO_ADMIN_EMAIL),
            )
            if user is None:
                user = User(
                    name="Admin",
                    email=DEMO_ADMIN_EMAIL,
                    password_hash=hash_password(DEMO_ADMIN_PASSWORD),
                    role="super_admin",
                    company_id=school.id,
                )
                session.add(user)
            else:
                user.company_id = school.id

            today = datetime.now(timezone.utc).date()
            today_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
            today_end = datetime.combine(today, time.max, tzinfo=timezone.utc)

            for index, student_data in enumerate(DEMO_STUDENTS, start=1):
                school_class = await get_or_create_class(
                    session,
                    school_id=school.id,
                    grade=student_data["grade"],
                    section=student_data["section"],
                )
                student = await session.scalar(
                    select(Student).where(
                        Student.school_id == school.id,
                        Student.student_code == student_data["student_code"],
                    ),
                )
                if student is None:
                    student = Student(
                        school_id=school.id,
                        class_id=school_class.id,
                        student_name=student_data["student_name"],
                        student_code=student_data["student_code"],
                        grade=student_data["grade"],
                        section=student_data["section"],
                        parent_name=student_data["parent_name"],
                        parent_phone=student_data["parent_phone"],
                        status="active",
                    )
                    session.add(student)
                    await session.flush()

                student.profile_image = demo_avatar_data_url(
                    student_data["student_name"],
                    student_data["avatar_color"],
                )

                if student_data["has_demo_face"]:
                    face_embedding = await session.scalar(
                        select(FaceEmbedding).where(FaceEmbedding.student_id == student.id),
                    )
                    if face_embedding is None:
                        session.add(
                            FaceEmbedding(
                                student_id=student.id,
                                embedding_vector=demo_embedding_vector(index),
                                model_name="demo-placeholder",
                            ),
                        )

                attendance = await session.scalar(
                    select(Attendance).where(
                        Attendance.student_id == student.id,
                        Attendance.company_id == school.id,
                        Attendance.check_in >= today_start,
                        Attendance.check_in <= today_end,
                    ),
                )
                if attendance is None:
                    session.add(
                        Attendance(
                            student_id=student.id,
                            company_id=school.id,
                            check_in=datetime.combine(
                                today,
                                time(hour=8 + (index % 3), minute=5 * index),
                                tzinfo=timezone.utc,
                            ),
                            status=student_data["attendance_status"],
                            confidence_score=student_data["confidence_score"],
                        ),
                    )

        print("Demo school seed data is ready.")
        print(f"School: {DEMO_SCHOOL_NAME}")
        print(f"Login: {DEMO_ADMIN_EMAIL}")
        print(f"Password: {DEMO_ADMIN_PASSWORD}")
        print(f"Students: {len(DEMO_STUDENTS)} demo records")


if __name__ == "__main__":
    asyncio.run(seed())
