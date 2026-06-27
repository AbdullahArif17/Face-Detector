"""Create demo data for local development."""

import asyncio
import base64
from datetime import datetime, time, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.attendance import Attendance
from app.models.branch import Branch
from app.models.company import Company
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.models.user import User

DEMO_COMPANY_NAME = "Demo Company"
DEMO_ADMIN_EMAIL = "admin@demo.com"
DEMO_ADMIN_PASSWORD = "admin123"

DEMO_EMPLOYEES = [
    {
        "name": "Avery Johnson",
        "email": "avery.johnson@faceattendance.dev",
        "legacy_email": "avery.johnson@demo.local",
        "phone": "+1 555 0101",
        "designation": "HR Manager",
        "department": "Human Resources",
        "status": "active",
        "attendance_status": "present",
        "confidence_score": 0.96,
        "has_demo_face": True,
        "avatar_color": "#2563eb",
    },
    {
        "name": "Maya Chen",
        "email": "maya.chen@faceattendance.dev",
        "legacy_email": "maya.chen@demo.local",
        "phone": "+1 555 0102",
        "designation": "Frontend Engineer",
        "department": "Engineering",
        "status": "active",
        "attendance_status": "late",
        "confidence_score": 0.91,
        "has_demo_face": True,
        "avatar_color": "#7c3aed",
    },
    {
        "name": "Noah Williams",
        "email": "noah.williams@faceattendance.dev",
        "legacy_email": "noah.williams@demo.local",
        "phone": "+1 555 0103",
        "designation": "Backend Engineer",
        "department": "Engineering",
        "status": "active",
        "attendance_status": "present",
        "confidence_score": 0.94,
        "has_demo_face": True,
        "avatar_color": "#0891b2",
    },
    {
        "name": "Sofia Patel",
        "email": "sofia.patel@faceattendance.dev",
        "legacy_email": "sofia.patel@demo.local",
        "phone": "+1 555 0104",
        "designation": "Operations Lead",
        "department": "Operations",
        "status": "active",
        "attendance_status": "absent",
        "confidence_score": None,
        "has_demo_face": False,
        "avatar_color": "#db2777",
    },
    {
        "name": "Ethan Brooks",
        "email": "ethan.brooks@faceattendance.dev",
        "legacy_email": "ethan.brooks@demo.local",
        "phone": "+1 555 0105",
        "designation": "Sales Executive",
        "department": "Sales",
        "status": "active",
        "attendance_status": "present",
        "confidence_score": 0.89,
        "has_demo_face": False,
        "avatar_color": "#ea580c",
    },
    {
        "name": "Isabella Garcia",
        "email": "isabella.garcia@faceattendance.dev",
        "legacy_email": "isabella.garcia@demo.local",
        "phone": "+1 555 0106",
        "designation": "QA Analyst",
        "department": "Quality Assurance",
        "status": "active",
        "attendance_status": "late",
        "confidence_score": 0.87,
        "has_demo_face": True,
        "avatar_color": "#16a34a",
    },
    {
        "name": "Liam Carter",
        "email": "liam.carter@faceattendance.dev",
        "legacy_email": "liam.carter@demo.local",
        "phone": "+1 555 0107",
        "designation": "Support Specialist",
        "department": "Customer Support",
        "status": "inactive",
        "attendance_status": "absent",
        "confidence_score": None,
        "has_demo_face": False,
        "avatar_color": "#475569",
    },
    {
        "name": "Olivia Martin",
        "email": "olivia.martin@faceattendance.dev",
        "legacy_email": "olivia.martin@demo.local",
        "phone": "+1 555 0108",
        "designation": "Finance Associate",
        "department": "Finance",
        "status": "active",
        "attendance_status": "present",
        "confidence_score": 0.93,
        "has_demo_face": False,
        "avatar_color": "#0f766e",
    },
]


def demo_embedding_vector(seed: int, dimensions: int = 128) -> list[float]:
    """Return a deterministic non-biometric placeholder vector for demo UI state."""
    vector = [0.0] * dimensions
    vector[seed % dimensions] = 1.0
    return vector


def demo_headshot_data_url(name: str, background_color: str) -> str:
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


async def seed() -> None:
    async with SessionLocal() as session:
        async with session.begin():
            company = await session.scalar(
                select(Company).where(Company.name == DEMO_COMPANY_NAME),
            )
            if company is None:
                company = Company(
                    name=DEMO_COMPANY_NAME,
                    package="starter",
                    employee_limit=50,
                    status="active",
                )
                session.add(company)
                await session.flush()

            branch = await session.scalar(
                select(Branch).where(
                    Branch.company_id == company.id,
                    Branch.name == "Main Branch",
                ),
            )
            if branch is None:
                branch = Branch(
                    company_id=company.id,
                    name="Main Branch",
                    location=None,
                )
                session.add(branch)
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
                    company_id=company.id,
                )
                session.add(user)

            today = datetime.now(timezone.utc).date()
            today_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
            today_end = datetime.combine(today, time.max, tzinfo=timezone.utc)

            for index, employee_data in enumerate(DEMO_EMPLOYEES, start=1):
                employee = await session.scalar(
                    select(Employee).where(Employee.email == employee_data["email"]),
                )
                if employee is None:
                    employee = await session.scalar(
                        select(Employee).where(
                            Employee.email == employee_data["legacy_email"],
                        ),
                    )
                if employee is None:
                    employee = Employee(
                        company_id=company.id,
                        branch_id=branch.id,
                        name=employee_data["name"],
                        email=employee_data["email"],
                        phone=employee_data["phone"],
                        designation=employee_data["designation"],
                        department=employee_data["department"],
                        status=employee_data["status"],
                    )
                    session.add(employee)
                    await session.flush()
                elif employee.email == employee_data["legacy_email"]:
                    employee.email = employee_data["email"]

                employee.headshot_url = demo_headshot_data_url(
                    employee_data["name"],
                    employee_data["avatar_color"],
                )

                if employee_data["has_demo_face"]:
                    face_embedding = await session.scalar(
                        select(FaceEmbedding).where(
                            FaceEmbedding.employee_id == employee.id,
                        ),
                    )
                    if face_embedding is None:
                        session.add(
                            FaceEmbedding(
                                employee_id=employee.id,
                                embedding_vector=demo_embedding_vector(index),
                                model_name="demo-placeholder",
                            ),
                        )

                attendance = await session.scalar(
                    select(Attendance).where(
                        Attendance.employee_id == employee.id,
                        Attendance.company_id == company.id,
                        Attendance.created_at >= today_start,
                        Attendance.created_at <= today_end,
                    ),
                )
                if attendance is None:
                    session.add(
                        Attendance(
                            employee_id=employee.id,
                            company_id=company.id,
                            check_in=datetime.combine(
                                today,
                                time(hour=9 + (index % 3), minute=5 * index),
                                tzinfo=timezone.utc,
                            ),
                            status=employee_data["attendance_status"],
                            confidence_score=employee_data["confidence_score"],
                        ),
                    )

        print("Demo seed data is ready.")
        print(f"Company: {DEMO_COMPANY_NAME}")
        print(f"Login: {DEMO_ADMIN_EMAIL}")
        print(f"Password: {DEMO_ADMIN_PASSWORD}")
        print(f"Employees: {len(DEMO_EMPLOYEES)} demo records")


if __name__ == "__main__":
    asyncio.run(seed())
