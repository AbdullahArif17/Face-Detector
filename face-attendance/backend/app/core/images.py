import base64
import binascii

from fastapi import HTTPException, status

MAX_IMAGE_BYTES = 2_000_000
MAX_IMAGE_BASE64_LENGTH = 2_700_000
ALLOWED_IMAGE_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}


def normalize_base64_image(image: str) -> str:
    if len(image) > MAX_IMAGE_BASE64_LENGTH:
        raise HTTPException(
            status_code=413,
            detail="Image is too large",
        )

    media_type = "image/jpeg"
    encoded = image
    if image.startswith("data:"):
        header, separator, encoded = image.partition(",")
        if not separator or ";base64" not in header:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Image data URL is invalid",
            )
        media_type = header[5:].split(";", 1)[0].lower()
        if media_type not in ALLOWED_IMAGE_MEDIA_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Image must be JPEG, PNG, or WebP",
            )

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
    if len(decoded) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image is too large",
        )

    return f"data:{media_type};base64,{encoded}"
