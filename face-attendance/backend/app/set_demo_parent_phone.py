"""Set the demo school's student parent phone for WhatsApp testing."""

from __future__ import annotations

import asyncio

from sqlalchemy import func, select, update

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.student import Student


async def main() -> None:
    async with SessionLocal() as session:
        school = await session.scalar(
            select(Company).where(func.lower(func.trim(Company.name)) == "demo school")
        )
        if school is None:
            raise RuntimeError("Demo School was not found")

        result = await session.execute(
            update(Student)
            .where(Student.school_id == school.id)
            .values(parent_phone="923362725979")
        )
        await session.commit()
        print(f"Updated {result.rowcount or 0} students in Demo School (company {school.id}).")


if __name__ == "__main__":
    asyncio.run(main())
