from datetime import datetime

from pydantic import BaseModel, Field

from app.core.images import MAX_IMAGE_BASE64_LENGTH


class FaceEnrollRequest(BaseModel):
    image: str = Field(
        min_length=1,
        max_length=MAX_IMAGE_BASE64_LENGTH,
        description="Base64-encoded image or data URL",
    )


class FaceEnrollResponse(BaseModel):
    success: bool
    student_id: int
    message: str


class FaceEnrollmentStatusResponse(BaseModel):
    student_id: int
    has_face_enrolled: bool
    enrollment_date: datetime | None = None
