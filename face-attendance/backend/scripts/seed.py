"""Seed repeatable demo data into the configured database."""

import asyncio
import os
from datetime import datetime, time, timedelta, timezone

from passlib.context import CryptContext
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Attendance, Branch, Company, Employee, User

DEMO_COMPANY_NAME = "Acme Demo Company"
DEMO_BRANCH_NAME = "Head Office"
DEMO_ADMIN_EMAIL = "admin@acme.example.com"
LEGACY_ADMIN_EMAIL = "admin@acme-demo.test"
DEMO_ADMIN_PASSWORD = os.getenv("DEMO_ADMIN_PASSWORD", "DemoPass123!")

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

EMPLOYEES = (
    ("Ava Johnson", "ava.johnson@acme.example.com", "+1-555-0101", "Product Manager"),
    ("Liam Smith", "liam.smith@acme.example.com", "+1-555-0102", "Software Engineer"),
    ("Olivia Brown", "olivia.brown@acme.example.com", "+1-555-0103", "HR Manager"),
    ("Noah Davis", "noah.davis@acme.example.com", "+1-555-0104", "UI/UX Designer"),
    ("Emma Wilson", "emma.wilson@acme.example.com", "+1-555-0105", "Data Analyst"),
    ("Ethan Miller", "ethan.miller@acme.example.com", "+1-555-0106", "Sales Executive"),
    ("Sophia Moore", "sophia.moore@acme.example.com", "+1-555-0107", "Support Specialist"),
    ("Mason Taylor", "mason.taylor@acme.example.com", "+1-555-0108", "Operations Lead"),
)

ATTENDANCE_STATUSES = (
    ("present", 8, 55, 0.98),
    ("present", 9, 1, 0.96),
    ("present", 8, 48, 0.97),
    ("present", 9, 4, 0.95),
    ("present", 8, 52, 0.99),
    ("late", 9, 27, 0.94),
    ("absent", 0, 0, None),
    ("absent", 0, 0, None),
)


async def get_or_create_company(session) -> Company:
    company = await session.scalar(
        select(Company).where(Company.name == DEMO_COMPANY_NAME),
    )
    if company is None:
        company = Company(
            name=DEMO_COMPANY_NAME,
            package="starter",
            employee_limit=25,
            status="active",
        )
        session.add(company)
        await session.flush()
    return company


async def get_or_create_branch(session, company: Company) -> Branch:
    branch = await session.scalar(
        select(Branch).where(
            Branch.company_id == company.id,
            Branch.name == DEMO_BRANCH_NAME,
        ),
    )
    if branch is None:
        branch = Branch(
            company_id=company.id,
            name=DEMO_BRANCH_NAME,
            location="San Francisco, CA",
        )
        session.add(branch)
        await session.flush()
    return branch


async def get_or_create_admin(session, company: Company) -> User:
    user = await session.scalar(
        select(User).where(User.email == DEMO_ADMIN_EMAIL),
    )
    if user is None:
        user = await session.scalar(
            select(User).where(User.email == LEGACY_ADMIN_EMAIL),
        )
        if user is not None:
            user.email = DEMO_ADMIN_EMAIL
    if user is None:
        user = User(
            name="Demo Administrator",
            email=DEMO_ADMIN_EMAIL,
            password_hash=password_context.hash(DEMO_ADMIN_PASSWORD),
            role="admin",
            company_id=company.id,
        )
        session.add(user)
        await session.flush()
    return user


async def get_or_create_employees(
    session,
    company: Company,
    branch: Branch,
) -> list[Employee]:
    employees: list[Employee] = []
    for name, email, phone, designation in EMPLOYEES:
        employee = await session.scalar(
            select(Employee).where(Employee.email == email),
        )
        if employee is None:
            legacy_email = email.replace("@acme.example.com", "@acme-demo.test")
            employee = await session.scalar(
                select(Employee).where(Employee.email == legacy_email),
            )
            if employee is not None:
                employee.email = email
        if employee is None:
            employee = Employee(
                company_id=company.id,
                branch_id=branch.id,
                name=name,
                email=email,
                phone=phone,
                designation=designation,
                status="active",
            )
            session.add(employee)
            await session.flush()
        employees.append(employee)
    return employees


async def seed_today_attendance(
    session,
    company: Company,
    employees: list[Employee],
) -> None:
    today = datetime.now(timezone.utc).date()
    day_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    for employee, (attendance_status, hour, minute, confidence) in zip(
        employees,
        ATTENDANCE_STATUSES,
        strict=True,
    ):
        existing = await session.scalar(
            select(Attendance).where(
                Attendance.employee_id == employee.id,
                Attendance.created_at >= day_start,
                Attendance.created_at < day_end,
            ),
        )
        if existing is not None:
            continue

        if attendance_status == "absent":
            check_in = day_start
            check_out = None
        else:
            check_in = day_start.replace(hour=hour, minute=minute)
            check_out = check_in + timedelta(hours=8)

        session.add(
            Attendance(
                employee_id=employee.id,
                company_id=company.id,
                check_in=check_in,
                check_out=check_out,
                status=attendance_status,
                confidence_score=confidence,
            ),
        )


async def seed() -> None:
    async with SessionLocal() as session:
        async with session.begin():
            company = await get_or_create_company(session)
            branch = await get_or_create_branch(session, company)
            admin = await get_or_create_admin(session, company)
            employees = await get_or_create_employees(session, company, branch)
            await seed_today_attendance(session, company, employees)

        print("Demo data is ready.")
        print(f"Company: {company.name}")
        print(f"Employees: {len(employees)}")
        print(f"Login: {admin.email}")
        print(f"Password: {DEMO_ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
