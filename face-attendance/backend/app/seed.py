"""Create the Phase 2 demo company and super administrator."""

import asyncio

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.company import Company
from app.models.user import User

DEMO_COMPANY_NAME = "Demo Company"
DEMO_ADMIN_EMAIL = "admin@demo.com"
DEMO_ADMIN_PASSWORD = "admin123"


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

        print("Phase 2 seed data is ready.")
        print(f"Company: {DEMO_COMPANY_NAME}")
        print(f"Login: {DEMO_ADMIN_EMAIL}")
        print(f"Password: {DEMO_ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
