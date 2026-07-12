from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.images import MAX_IMAGE_BASE64_LENGTH


def validate_pakistan_phone(value: str) -> str:
    normalized = (
        value.strip()
        .replace(" ", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )
    if normalized.startswith("+"):
        normalized = normalized[1:]
    if normalized.startswith("03") and len(normalized) == 11:
        normalized = f"92{normalized[1:]}"
    if not (normalized.isdigit() and len(normalized) == 12 and normalized.startswith("92")):
        raise ValueError(
            "Phone must be Pakistan format, for example 923001234567 or 03001234567",
        )
    return normalized


class StudentCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=255)
    student_code: str = Field(min_length=1, max_length=100)
    grade: str = Field(min_length=1, max_length=50)
    section: str = Field(min_length=1, max_length=20)
    parent_name: str = Field(min_length=1, max_length=255)
    parent_phone: str = Field(min_length=12, max_length=20)
    parent_phone_2: str | None = Field(default=None, max_length=20)
    profile_image: str | None = Field(default=None, max_length=MAX_IMAGE_BASE64_LENGTH)
    class_id: int | None = None

    @field_validator("parent_phone")
    @classmethod
    def validate_parent_phone(cls, value: str) -> str:
        return validate_pakistan_phone(value)

    @field_validator("parent_phone_2")
    @classmethod
    def validate_second_parent_phone(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        return validate_pakistan_phone(value)


class StudentUpdate(BaseModel):
    student_name: str | None = Field(default=None, min_length=1, max_length=255)
    student_code: str | None = Field(default=None, min_length=1, max_length=100)
    grade: str | None = Field(default=None, min_length=1, max_length=50)
    section: str | None = Field(default=None, min_length=1, max_length=20)
    parent_name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_phone: str | None = Field(default=None, max_length=20)
    parent_phone_2: str | None = Field(default=None, max_length=20)
    profile_image: str | None = Field(default=None, max_length=MAX_IMAGE_BASE64_LENGTH)
    class_id: int | None = None
    status: str | None = Field(default=None, max_length=50)

    @field_validator("parent_phone")
    @classmethod
    def validate_parent_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_pakistan_phone(value)

    @field_validator("parent_phone_2")
    @classmethod
    def validate_second_parent_phone(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        return validate_pakistan_phone(value)


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    class_id: int
    student_name: str
    student_code: str
    grade: str
    section: str
    parent_name: str
    parent_phone: str
    parent_phone_2: str | None
    profile_image: str | None
    status: str
    has_face_enrolled: bool = False
    created_at: datetime


class StudentImportError(BaseModel):
    row: int
    student_code: str | None = None
    error: str


class StudentImportResponse(BaseModel):
    created: int
    failed: int
    errors: list[StudentImportError]
