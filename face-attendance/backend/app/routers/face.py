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
from app.dependencies import get_current_user
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
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


async def get_company_employee(
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


@router.post("/enroll/{employee_id}", response_model=FaceEnrollResponse)
async def enroll_face(
    request: Request,
    employee_id: int,
    payload: FaceEnrollRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FaceEnrollResponse:
    employee = await get_company_employee(
        session,
        employee_id=employee_id,
        current_user=current_user,
    )
    headshot_url = normalize_headshot_image(payload.image)

    try:
        client: httpx.AsyncClient = request.app.state.http_client
        response = await client.post(
            f"{settings.ai_service_url}/enroll",
            json={"employee_id": str(employee_id), "image": payload.image},
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
    if not isinstance(embedding, list) or not all(
        isinstance(value, int | float) for value in embedding
    ):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid embedding",
        )

    existing_embedding = await session.scalar(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == employee_id),
    )
    if existing_embedding is None:
        session.add(
            FaceEmbedding(
                employee_id=employee_id,
                embedding_vector=[float(value) for value in embedding],
                model_name="deepface",
            ),
        )
    else:
        existing_embedding.embedding_vector = [float(value) for value in embedding]
        existing_embedding.model_name = "deepface"
        existing_embedding.updated_at = datetime.now(timezone.utc)

    employee.headshot_url = headshot_url
    await session.commit()
    return FaceEnrollResponse(
        success=True,
        employee_id=employee_id,
        message="Face enrolled successfully",
    )


@router.get(
    "/enrollment-status/{employee_id}",
    response_model=FaceEnrollmentStatusResponse,
)
async def get_enrollment_status(
    employee_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FaceEnrollmentStatusResponse:
    await get_company_employee(
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


@router.delete("/unenroll/{employee_id}", response_model=FaceEnrollResponse)
async def unenroll_face(
    employee_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FaceEnrollResponse:
    await get_company_employee(
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
    if employee is not None:
        employee.headshot_url = None

    await session.commit()

    return FaceEnrollResponse(
        success=True,
        employee_id=employee_id,
        message="Face unenrolled successfully",
    )
