import base64
import binascii
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.dependencies import require_role
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.schemas.face import (
    FaceEnrollmentStatusResponse,
    FaceEnrollRequest,
    FaceEnrollResponse,
)

router = APIRouter(prefix="/face", tags=["face"])

AI_SERVICE_TIMEOUT_SECONDS = 90.0
MAX_HEADSHOT_BYTES = 2_000_000


def normalize_headshot_image(image: str) -> str:
    encoded = image.split(",", 1)[-1]
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image is not valid base64",
        ) from exc

    if not decoded:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image is empty",
        )

    if len(decoded) > MAX_HEADSHOT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large",
        )

    if image.startswith("data:image/"):
        return image
    return f"data:image/jpeg;base64,{encoded}"


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


def extract_ai_error(payload: Any) -> str:
    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str):
            return detail
        if isinstance(detail, list):
            return "AI service rejected the image"
    return "AI service failed to enroll the face"


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
    headshot_url = normalize_headshot_image(payload.image)

    try:
        client: httpx.AsyncClient = request.app.state.http_client
        response = await client.post(
            f"{settings.ai_service_url}/enroll",
            json={"employee_id": str(student_id), "image": payload.image},
            headers={"X-API-Key": settings.ai_api_key},
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

    existing_embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student_id),
    )
    if existing_embedding is None:
        session.add(
            FaceEmbedding(
                student_id=student_id,
                embedding_vector=[float(value) for value in embedding],
                model_name=model_name if isinstance(model_name, str) else "deepface",
            ),
        )
    else:
        existing_embedding.embedding_vector = [float(value) for value in embedding]
        existing_embedding.model_name = (
            model_name if isinstance(model_name, str) else "deepface"
        )
        existing_embedding.updated_at = datetime.now(timezone.utc)

    student.profile_image = headshot_url
    await session.commit()
    return FaceEnrollResponse(
        success=True,
        student_id=student_id,
        message="Face enrolled successfully",
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
    if student is not None:
        student.profile_image = None

    await session.commit()

    return FaceEnrollResponse(
        success=True,
        student_id=student_id,
        message="Face unenrolled successfully",
    )
