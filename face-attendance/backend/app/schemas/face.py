from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.core.images import MAX_IMAGE_BASE64_LENGTH


class FaceEnrollRequest(BaseModel):
    image: str | None = Field(
        default=None,
        min_length=1,
        max_length=MAX_IMAGE_BASE64_LENGTH,
        description="Backward-compatible single base64 image or data URL",
    )
    images: list[str] = Field(
        default_factory=list,
        max_length=3,
        description="One to three photos of the same student",
    )
    update_profile_image: bool | None = Field(
        default=None,
        description=(
            "Whether the first face sample should replace the profile photo. "
            "Legacy clients default to filling a missing profile photo only."
        ),
    )

    @model_validator(mode="after")
    def validate_images(self) -> "FaceEnrollRequest":
        resolved = self.resolved_images()
        if not resolved:
            raise ValueError("image or images is required")
        if any(not image or len(image) > MAX_IMAGE_BASE64_LENGTH for image in resolved):
            raise ValueError("Each face image must be valid and under the size limit")
        return self

    def resolved_images(self) -> list[str]:
        if self.images:
            return self.images
        return [self.image] if self.image else []


class FaceEnrollResponse(BaseModel):
    success: bool
    student_id: int
    message: str
    profile_image: str | None = None


class FaceEnrollmentStatusResponse(BaseModel):
    student_id: int
    has_face_enrolled: bool
    enrollment_date: datetime | None = None
