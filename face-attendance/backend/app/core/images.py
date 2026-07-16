import base64
import binascii
from io import BytesIO

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 2_000_000
MAX_IMAGE_BASE64_LENGTH = 2_700_000
ALLOWED_IMAGE_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}
THUMBNAIL_MAX_SIDE = 160
THUMBNAIL_MAX_PIXELS = 20_000_000


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
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Image data URL is invalid",
            )
        media_type = header[5:].split(";", 1)[0].lower()
        if media_type not in ALLOWED_IMAGE_MEDIA_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Image must be JPEG, PNG, or WebP",
            )

    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image is not valid base64",
        ) from exc

    if not decoded:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image is empty",
        )
    if len(decoded) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image is too large",
        )

    return f"data:{media_type};base64,{encoded}"


def make_profile_thumbnail(image: str) -> str:
    normalized = normalize_base64_image(image)
    encoded = normalized.split(",", 1)[1]
    try:
        with Image.open(BytesIO(base64.b64decode(encoded))) as source:
            if source.width * source.height > THUMBNAIL_MAX_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Image dimensions are too large",
                )
            thumbnail = ImageOps.exif_transpose(source).convert("RGB")
            thumbnail.thumbnail(
                (THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE),
                Image.Resampling.LANCZOS,
            )
            output = BytesIO()
            thumbnail.save(output, format="JPEG", quality=70, optimize=True)
    except HTTPException:
        raise
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image could not be processed",
        ) from exc

    thumbnail_base64 = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{thumbnail_base64}"
