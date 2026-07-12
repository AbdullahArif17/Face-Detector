import csv
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.images import normalize_base64_image
from app.dependencies import require_role
from app.models.branch import Branch
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.models.whatsapp_log import WhatsappLog
from app.schemas.student import (
    StudentCreate,
    StudentImportError,
    StudentImportResponse,
    StudentResponse,
    StudentUpdate,
)
from app.schemas.whatsapp import WhatsappLogResponse

router = APIRouter(prefix="/students", tags=["students"])
MAX_CSV_BYTES = 1_000_000
MAX_CSV_ROWS = 5_000


def normalize_grade(grade: str) -> str:
    trimmed = grade.strip()
    if trimmed.lower().startswith("class "):
        return f"Class {trimmed.split(None, 1)[1].strip()}"
    return f"Class {trimmed}" if trimmed.isdigit() else trimmed


def normalize_section(section: str) -> str:
    return section.strip().upper()


async def get_or_create_class(
    session: AsyncSession,
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

    school_class = Branch(
        company_id=school_id,
        name=class_name,
        location="Classroom",
    )
    session.add(school_class)
    await session.flush()
    return school_class


async def get_school_student(
    session: AsyncSession,
    *,
    student_id: int,
    school_id: int,
) -> Student:
    student = await session.get(Student, student_id)
    if student is None or student.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )
    return student


async def ensure_unique_student_code(
    session: AsyncSession,
    *,
    school_id: int,
    student_code: str,
    exclude_student_id: int | None = None,
) -> None:
    query = select(Student.id).where(
        Student.school_id == school_id,
        func.lower(Student.student_code) == student_code.lower(),
    )
    if exclude_student_id is not None:
        query = query.where(Student.id != exclude_student_id)
    existing_id = await session.scalar(query)
    if existing_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A student with this roll number already exists",
        )


async def build_student_response(
    session: AsyncSession,
    student: Student,
    *,
    has_face_enrolled: bool | None = None,
) -> StudentResponse:
    if has_face_enrolled is None:
        embedding_id = await session.scalar(
            select(FaceEmbedding.id).where(FaceEmbedding.student_id == student.id),
        )
        has_face_enrolled = embedding_id is not None
    return StudentResponse(
        id=student.id,
        school_id=student.school_id,
        class_id=student.class_id,
        student_name=student.student_name,
        student_code=student.student_code,
        grade=student.grade,
        section=student.section,
        parent_name=student.parent_name,
        parent_phone=student.parent_phone,
        parent_phone_2=student.parent_phone_2,
        profile_image=student.profile_image,
        status=student.status,
        has_face_enrolled=has_face_enrolled,
        created_at=student.created_at,
    )


@router.get("", response_model=list[StudentResponse])
async def list_students(
    grade: str | None = None,
    section: str | None = None,
    status_filter: str | None = Query(default="active", alias="status"),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[StudentResponse]:
    query = (
        select(Student)
        .where(Student.school_id == current_user.company_id)
        .order_by(Student.student_name)
    )
    if grade:
        query = query.where(Student.grade == normalize_grade(grade))
    if section:
        query = query.where(Student.section == normalize_section(section))
    if status_filter:
        query = query.where(Student.status == status_filter)

    query = query.add_columns(FaceEmbedding.id).outerjoin(
        FaceEmbedding,
        FaceEmbedding.student_id == Student.id,
    )
    rows = (await session.execute(query)).all()
    return [
        await build_student_response(
            session,
            student,
            has_face_enrolled=embedding_id is not None,
        )
        for student, embedding_id in rows
    ]


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: StudentCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> StudentResponse:
    school_id = current_user.company_id
    grade = normalize_grade(payload.grade)
    section = normalize_section(payload.section)
    student_code = payload.student_code.strip()

    await ensure_unique_student_code(
        session,
        school_id=school_id,
        student_code=student_code,
    )

    school_class = (
        await session.get(Branch, payload.class_id)
        if payload.class_id is not None
        else await get_or_create_class(
            session,
            school_id=school_id,
            grade=grade,
            section=section,
        )
    )
    if school_class is None or school_class.company_id != school_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid class")

    student = Student(
        school_id=school_id,
        class_id=school_class.id,
        student_name=payload.student_name.strip(),
        student_code=student_code,
        grade=grade,
        section=section,
        parent_name=payload.parent_name.strip(),
        parent_phone=payload.parent_phone,
        parent_phone_2=payload.parent_phone_2,
        profile_image=(
            normalize_base64_image(payload.profile_image)
            if payload.profile_image
            else None
        ),
        status="active",
    )
    session.add(student)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A student with this roll number already exists",
        ) from exc
    await session.refresh(student)
    return await build_student_response(session, student)


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    payload: StudentUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> StudentResponse:
    student = await get_school_student(
        session,
        student_id=student_id,
        school_id=current_user.company_id,
    )
    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("profile_image"):
        update_data["profile_image"] = normalize_base64_image(
            str(update_data["profile_image"]),
        )

    if "student_code" in update_data and update_data["student_code"] is not None:
        student_code = str(update_data["student_code"]).strip()
        await ensure_unique_student_code(
            session,
            school_id=current_user.company_id,
            student_code=student_code,
            exclude_student_id=student.id,
        )
        update_data["student_code"] = student_code

    if "grade" in update_data and update_data["grade"] is not None:
        update_data["grade"] = normalize_grade(str(update_data["grade"]))
    if "section" in update_data and update_data["section"] is not None:
        update_data["section"] = normalize_section(str(update_data["section"]))

    grade = update_data.get("grade", student.grade)
    section = update_data.get("section", student.section)
    if "class_id" not in update_data or update_data["class_id"] is None:
        school_class = await get_or_create_class(
            session,
            school_id=current_user.company_id,
            grade=grade,
            section=section,
        )
        update_data["class_id"] = school_class.id
    else:
        school_class = await session.get(Branch, update_data["class_id"])
        if school_class is None or school_class.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid class")

    for field, value in update_data.items():
        if value is not None or field in {"parent_phone_2", "profile_image"}:
            setattr(student, field, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A student with this roll number already exists",
        ) from exc
    await session.refresh(student)
    return await build_student_response(session, student)


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> None:
    student = await get_school_student(
        session,
        student_id=student_id,
        school_id=current_user.company_id,
    )
    student.status = "inactive"
    await session.commit()


@router.get("/{student_id}/whatsapp-logs", response_model=list[WhatsappLogResponse])
async def get_student_whatsapp_logs(
    student_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[WhatsappLogResponse]:
    student = await get_school_student(
        session,
        student_id=student_id,
        school_id=current_user.company_id,
    )
    result = await session.execute(
        select(WhatsappLog)
        .where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.student_id == student.id,
        )
        .order_by(WhatsappLog.created_at.desc()),
    )
    logs = list(result.scalars().all())
    return [
        WhatsappLogResponse(
            id=log.id,
            school_id=log.school_id,
            student_id=log.student_id,
            student_name=student.student_name,
            parent_phone=log.parent_phone,
            message_type=log.message_type,
            message_body=log.message_body,
            status=log.status,
            meta_message_id=log.meta_message_id,
            error_message=log.error_message,
            sent_at=log.sent_at,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.post("/import", response_model=StudentImportResponse)
async def import_students(
    file: UploadFile,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> StudentImportResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a CSV file")

    raw_content = await file.read(MAX_CSV_BYTES + 1)
    if len(raw_content) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=413,
            detail="CSV file is too large",
        )
    try:
        content = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file must use UTF-8 encoding",
        ) from exc
    reader = csv.DictReader(StringIO(content))
    required_columns = {
        "student_name",
        "student_code",
        "grade",
        "section",
        "parent_name",
        "parent_phone",
    }
    if not reader.fieldnames or not required_columns.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must include student_name, student_code, grade, section, parent_name, parent_phone",
        )

    created = 0
    errors: list[StudentImportError] = []

    for row_index, row in enumerate(reader, start=2):
        if row_index > MAX_CSV_ROWS + 1:
            errors.append(
                StudentImportError(
                    row=row_index,
                    error=f"CSV is limited to {MAX_CSV_ROWS} student rows",
                ),
            )
            break
        try:
            payload = StudentCreate(
                student_name=row.get("student_name", ""),
                student_code=row.get("student_code", ""),
                grade=row.get("grade", ""),
                section=row.get("section", ""),
                parent_name=row.get("parent_name", ""),
                parent_phone=row.get("parent_phone", ""),
            )
            await create_student(payload, session=session, current_user=current_user)
            created += 1
        except HTTPException as exc:
            await session.rollback()
            errors.append(
                StudentImportError(
                    row=row_index,
                    student_code=row.get("student_code"),
                    error=str(exc.detail),
                ),
            )
        except ValidationError as exc:
            await session.rollback()
            first_error = exc.errors()[0] if exc.errors() else {}
            errors.append(
                StudentImportError(
                    row=row_index,
                    student_code=row.get("student_code"),
                    error=str(first_error.get("msg", "Invalid student row")),
                ),
            )
        except Exception:
            await session.rollback()
            errors.append(
                StudentImportError(
                    row=row_index,
                    student_code=row.get("student_code"),
                    error="Unable to import this student row",
                ),
            )

    return StudentImportResponse(created=created, failed=len(errors), errors=errors)
