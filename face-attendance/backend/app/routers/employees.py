from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import require_role
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate

router = APIRouter(prefix="/employees", tags=["employees"])

def employee_to_response(
    employee: Employee,
    *,
    has_face_enrolled: bool = False,
) -> EmployeeResponse:
    return EmployeeResponse(
        id=employee.id,
        company_id=employee.company_id,
        branch_id=employee.branch_id,
        name=employee.name,
        email=employee.email,
        phone=employee.phone,
        designation=employee.designation,
        department=employee.department,
        headshot_url=employee.headshot_url,
        status=employee.status,
        has_face_enrolled=has_face_enrolled,
    )


async def ensure_branch_belongs_to_company(
    session: AsyncSession,
    *,
    branch_id: int,
    company_id: int,
) -> int:
    branch = await session.scalar(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.company_id == company_id,
        ),
    )
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch does not exist for this company",
        )
    return branch.id


async def get_or_create_default_branch(
    session: AsyncSession,
    *,
    company_id: int,
) -> int:
    branch = await session.scalar(
        select(Branch)
        .where(
            Branch.company_id == company_id,
            Branch.name == "Main Branch",
        )
        .order_by(Branch.id),
    )
    if branch is not None:
        return branch.id

    branch = Branch(company_id=company_id, name="Main Branch", location=None)
    session.add(branch)
    await session.flush()
    return branch.id


async def employee_has_face_embedding(
    session: AsyncSession,
    employee_id: int,
) -> bool:
    # Legacy employee face enrollment was superseded by student enrollment in Phase 5.
    return False


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> list[EmployeeResponse]:
    offset = (page - 1) * per_page
    result = await session.execute(
        select(Employee)
        .where(Employee.company_id == current_user.company_id)
        .order_by(Employee.id)
        .offset(offset)
        .limit(per_page),
    )
    return [
        employee_to_response(
            employee,
            has_face_enrolled=False,
        )
        for employee in result.scalars().all()
    ]


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> EmployeeResponse:
    branch_id = (
        await ensure_branch_belongs_to_company(
            session,
            branch_id=payload.branch_id,
            company_id=current_user.company_id,
        )
        if payload.branch_id is not None
        else await get_or_create_default_branch(
            session,
            company_id=current_user.company_id,
        )
    )

    employee_data = payload.model_dump(exclude={"branch_id"})
    employee_data["email"] = str(employee_data["email"]).lower()

    employee = Employee(
        **employee_data,
        company_id=current_user.company_id,
        branch_id=branch_id,
        status="active",
    )
    session.add(employee)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists",
        ) from exc

    await session.refresh(employee)
    return employee_to_response(employee)


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> EmployeeResponse:
    employee = await session.get(Employee, employee_id)
    if employee is None or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] is not None:
        update_data["email"] = str(update_data["email"]).lower()

    if "branch_id" in update_data:
        await ensure_branch_belongs_to_company(
            session,
            branch_id=update_data["branch_id"],
            company_id=current_user.company_id,
        )

    if "email" in update_data and update_data["email"] is not None:
        duplicate_id = await session.scalar(
            select(Employee.id).where(
                Employee.company_id == current_user.company_id,
                func.lower(Employee.email) == str(update_data["email"]).lower(),
                Employee.id != employee.id,
            ),
        )
        if duplicate_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee with this email already exists",
            )

    for field, value in update_data.items():
        setattr(employee, field, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists",
        ) from exc

    await session.refresh(employee)
    return employee_to_response(
        employee,
        has_face_enrolled=await employee_has_face_embedding(session, employee.id),
    )


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> Response:
    employee = await session.get(Employee, employee_id)
    if employee is None or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    employee.status = "inactive"
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
