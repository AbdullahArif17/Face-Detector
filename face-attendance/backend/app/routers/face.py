from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.biometrics import BiometricConfigurationError, prepare_embedding_storage
from app.core.database import get_db
from app.core.images import normalize_base64_image
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
    normalized_images = [
        normalize_base64_image(image) for image in payload.resolved_images()
    ]
    headshot_url = normalized_images[0]

    try:
        client: httpx.AsyncClient = request.app.state.http_client
        response = await client.post(
            f"{settings.ai_service_url}/enroll",
            json={
                "student_id": student_id,
                "image": headshot_url,
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

    normalized_embedding = [float(value) for value in embedding]
    try:
        ciphertext, legacy_vector = prepare_embedding_storage(normalized_embedding)
    except BiometricConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    existing_embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student_id),
    )
    if existing_embedding is None:
        session.add(
            FaceEmbedding(
                student_id=student_id,
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

    student.profile_image = headshot_url
    await session.commit()
    return FaceEnrollResponse(
        success=True,
        student_id=student_id,
        message=(
            "Face enrolled successfully"
            if len(normalized_images) == 1
            else f"Face enrolled from {len(normalized_images)} photos"
        ),
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
