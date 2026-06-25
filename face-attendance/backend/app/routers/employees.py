from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeRead, EmployeeUpdate

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeRead])
async def list_employees(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Employee]:
    result = await session.execute(
        select(Employee)
        .where(Employee.company_id == current_user.company_id)
        .order_by(Employee.id),
    )
    return list(result.scalars().all())


@router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    employee = Employee(
        **payload.model_dump(exclude={"company_id"}),
        company_id=current_user.company_id,
    )
    session.add(employee)
    await session.commit()
    await session.refresh(employee)
    return employee


@router.put("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    employee = await session.get(Employee, employee_id)
    if employee is None or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    for field, value in payload.model_dump(
        exclude_unset=True,
        exclude={"company_id"},
    ).items():
        setattr(employee, field, value)

    await session.commit()
    await session.refresh(employee)
    return employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    employee = await session.get(Employee, employee_id)
    if employee is None or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    await session.delete(employee)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
