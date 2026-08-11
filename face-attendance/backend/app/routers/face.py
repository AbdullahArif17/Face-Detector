from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.biometrics import BiometricConfigurationError, prepare_embedding_storage
from app.core.database import get_db
from app.core.images import make_profile_thumbnail, normalize_base64_image
from app.dependencies import require_role
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.schemas.face import (
    FaceEnrollmentStatusResponse,
    FaceEnrollRequest,
    FaceEnrollResponse,
)

router = APIRouter(prefix="/face", tags=["face"])

AI_SERVICE_TIMEOUT_SECONDS = 110.0


def ai_service_headers() -> dict[str, str]:
    api_key = settings.ai_api_key
    if not api_key:
        return {}
    return {"X-API-Key": api_key}


async def get_school_student(
    session: AsyncSession,
    *,
    student_id: int,
    current_user: User,
) -> Student:
    student = await session.get(Student, student_id)
    if student is None or student.school_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student


async def get_school_employee(
    session: AsyncSession,
    *,
    employee_id: int,
    current_user: User,
) -> Employee:
    employee = await session.get(Employee, employee_id)
    if employee is None or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


def extract_ai_error(payload: Any) -> str:
    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str):
            return detail
        if isinstance(detail, list):
            return "AI service rejected the image"
    return "AI service failed to enroll the face"


def should_update_profile_image(
    *,
    requested: bool | None,
    current_profile_image: str | None,
) -> bool:
    if requested is not None:
        return requested
    return current_profile_image is None


async def _call_ai_enroll(
    request: Request,
    *,
    subject_ref: str,
    normalized_images: list[str],
) -> tuple[list[float], str]:
    """POST images to the AI service; returns (embedding, model_name)."""
    try:
        client: httpx.AsyncClient = request.app.state.http_client
        response = await client.post(
            f"{settings.ai_service_url}/enroll",
            json={
                "employee_id": subject_ref,
                "images": normalized_images,
            },
            headers=ai_service_headers(),
            timeout=AI_SERVICE_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        ) from exc

    if response.status_code >= 400:
        try:
            error_payload: Any = response.json()
        except ValueError:
            error_payload = None
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=extract_ai_error(error_payload),
        )

    data = response.json()
    embedding = data.get("embedding")
    model_name = data.get("model")
    if not isinstance(embedding, list) or not all(
        isinstance(value, int | float) for value in embedding
    ):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid embedding",
        )
    if not isinstance(model_name, str) or model_name.casefold() != settings.ai_model_name.casefold():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "AI service model does not match backend configuration; "
                "check AI_MODEL_NAME"
            ),
        )
    return [float(value) for value in embedding], model_name


async def _enroll_subject(
    session: AsyncSession,
    request: Request,
    *,
    subject_ref: str,
    payload: FaceEnrollRequest,
    student: Student | None = None,
    employee: Employee | None = None,
) -> FaceEnrollResponse:
    """Enroll or re-enroll one face subject against the AI service."""
    normalized_images = [
        normalize_base64_image(image) for image in payload.resolved_images()
    ]
    headshot_url = normalized_images[0]

    normalized_embedding, model_name = await _call_ai_enroll(
        request,
        subject_ref=subject_ref,
        normalized_images=normalized_images,
    )
    try:
        ciphertext, legacy_vector = prepare_embedding_storage(normalized_embedding)
    except BiometricConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    existing_embedding = await session.scalar(
        select(FaceEmbedding).where(
            (FaceEmbedding.student_id == (student.id if student is not None else None))
            | (FaceEmbedding.employee_id == (employee.id if employee is not None else None))
        ),
    )
    if existing_embedding is None:
        session.add(
            FaceEmbedding(
                student_id=student.id if student is not None else None,
                employee_id=employee.id if employee is not None else None,
                embedding_vector=legacy_vector,
                embedding_ciphertext=ciphertext,
                model_name=model_name,
            ),
        )
    else:
        existing_embedding.embedding_vector = legacy_vector
        existing_embedding.embedding_ciphertext = ciphertext
        existing_embedding.model_name = model_name
        existing_embedding.updated_at = datetime.now(timezone.utc)

    profile_image = (
        student.profile_image if student is not None else employee.headshot_url
    )
    if should_update_profile_image(
        requested=payload.update_profile_image,
        current_profile_image=profile_image,
    ):
        thumbnail = make_profile_thumbnail(headshot_url)
        if student is not None:
            student.profile_image = thumbnail
        else:
            employee.headshot_url = thumbnail
        profile_image = thumbnail
    await session.commit()
    return FaceEnrollResponse(
        success=True,
        student_id=student.id if student is not None else None,
        employee_id=employee.id if employee is not None else None,
        message=(
            "Face enrolled successfully"
            if len(normalized_images) == 1
            else f"Face enrolled from {len(normalized_images)} photos"
        ),
        profile_image=profile_image,
    )


@router.post("/enroll/{student_id}", response_model=FaceEnrollResponse)
async def enroll_face(
    request: Request,
    student_id: int,
    payload: FaceEnrollRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> FaceEnrollResponse:
    student = await get_school_student(
        session,
        student_id=student_id,
        current_user=current_user,
    )
    return await _enroll_subject(
        session,
        request,
        subject_ref=str(student_id),
        payload=payload,
        student=student,
    )


@router.post("/employee-enroll/{employee_id}", response_model=FaceEnrollResponse)
async def enroll_employee_face(
    request: Request,
    employee_id: int,
    payload: FaceEnrollRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> FaceEnrollResponse:
    employee = await get_school_employee(
        session,
        employee_id=employee_id,
        current_user=current_user,
    )
    # Prefix keeps employee subjects distinct from students in the AI service
    # ("e5" vs "5"); the kiosk router maps the prefix back after recognition.
    return await _enroll_subject(
        session,
        request,
        subject_ref=f"e{employee_id}",
        payload=payload,
        employee=employee,
    )


@router.get(
    "/enrollment-status/{student_id}",
    response_model=FaceEnrollmentStatusResponse,
)
async def get_enrollment_status(
    student_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> FaceEnrollmentStatusResponse:
    await get_school_student(
        session,
        student_id=student_id,
        current_user=current_user,
    )
    embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student_id),
    )
    return FaceEnrollmentStatusResponse(
        student_id=student_id,
        has_face_enrolled=embedding is not None,
        enrollment_date=embedding.created_at if embedding is not None else None,
    )


@router.get(
    "/employee-enrollment-status/{employee_id}",
    response_model=FaceEnrollmentStatusResponse,
)
async def get_employee_enrollment_status(
    employee_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> FaceEnrollmentStatusResponse:
    await get_school_employee(
        session,
        employee_id=employee_id,
        current_user=current_user,
    )
    embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == employee_id),
    )
    return FaceEnrollmentStatusResponse(
        employee_id=employee_id,
        has_face_enrolled=embedding is not None,
        enrollment_date=embedding.created_at if embedding is not None else None,
    )


@router.delete("/employee-unenroll/{employee_id}", response_model=FaceEnrollResponse)
async def unenroll_employee_face(
    employee_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> FaceEnrollResponse:
    await get_school_employee(
        session,
        employee_id=employee_id,
        current_user=current_user,
    )
    embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == employee_id),
    )
    if embedding is not None:
        await session.delete(embedding)

    employee = await session.get(Employee, employee_id)

    await session.commit()

    return FaceEnrollResponse(
        success=True,
        employee_id=employee_id,
        message="Face unenrolled successfully; profile photo retained",
        profile_image=employee.headshot_url if employee is not None else None,
    )


@router.delete("/unenroll/{student_id}", response_model=FaceEnrollResponse)
async def unenroll_face(
    student_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> FaceEnrollResponse:
    await get_school_student(
        session,
        student_id=student_id,
        current_user=current_user,
    )
    embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student_id),
    )
    if embedding is not None:
        await session.delete(embedding)

    student = await session.get(Student, student_id)

    await session.commit()

    return FaceEnrollResponse(
        success=True,
        student_id=student_id,
        message="Face unenrolled successfully; profile photo retained",
        profile_image=student.profile_image if student is not None else None,
    )
