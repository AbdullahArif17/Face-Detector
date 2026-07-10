import base64
import binascii
from io import BytesIO

import cv2
import numpy as np
from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError


def base64_to_image(b64_string: str) -> np.ndarray:
    encoded = b64_string.split(",", 1)[-1]
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image is not valid base64",
        ) from exc

    try:
        with Image.open(BytesIO(image_bytes)) as pil_image:
            oriented_image = ImageOps.exif_transpose(pil_image).convert("RGB")
            rgb_image = np.asarray(oriented_image)
            return cv2.cvtColor(rgb_image, cv2.COLOR_RGB2BGR)
    except (UnidentifiedImageError, OSError, ValueError):
        # Fall back to OpenCV decoding for image formats Pillow cannot parse.
        pass

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image could not be decoded",
        )
    return image


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    first = np.asarray(vec1, dtype=np.float32)
    second = np.asarray(vec2, dtype=np.float32)
    if first.shape != second.shape:
        raise ValueError("Vectors must have the same shape")

    first_norm = np.linalg.norm(first)
    second_norm = np.linalg.norm(second)
    if first_norm == 0 or second_norm == 0:
        raise ValueError("Vectors must be non-zero")

    return float(np.dot(first, second) / (first_norm * second_norm))
