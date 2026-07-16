import asyncio
from contextlib import asynccontextmanager
import hmac
import logging
import math
import os
import sys
from dataclasses import dataclass

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

# DeepFace emits Unicode status symbols while downloading model weights. Windows
# PowerShell may otherwise expose a legacy cp1252 stream and fail before download.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

from deepface import DeepFace  # noqa: E402

from utils import base64_to_image, cosine_similarity  # noqa: E402


logger = logging.getLogger("face_attendance_ai")
logger.setLevel(logging.INFO)
MULTIPLE_FACES_DETAIL = "Multiple faces were detected; exactly one face is required"


def bounded_float_env(
    name: str,
    default: str,
    *,
    minimum: float,
    maximum: float,
) -> float:
    value = float(os.getenv(name, default))
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def bounded_int_env(
    name: str,
    default: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    value = int(os.getenv(name, default))
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


RECOGNITION_THRESHOLD = bounded_float_env(
    "RECOGNITION_THRESHOLD", "0.42", minimum=0.0, maximum=1.0,
)
RECOGNITION_MARGIN = bounded_float_env(
    "RECOGNITION_MARGIN", "0.03", minimum=0.0, maximum=1.0,
)
DEEPFACE_MODEL = os.getenv("DEEPFACE_MODEL", "ArcFace")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "retinaface")
FALLBACK_DETECTOR_BACKENDS = [
    backend.strip()
    for backend in os.getenv("FALLBACK_DETECTOR_BACKENDS", "opencv,ssd,mtcnn").split(",")
    if backend.strip()
]
ENABLE_ENROLLMENT_AUGMENTATION = (
    os.getenv("ENABLE_ENROLLMENT_AUGMENTATION", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
ENABLE_RECOGNITION_AUGMENTATION = (
    os.getenv("ENABLE_RECOGNITION_AUGMENTATION", "false").strip().lower()
    in {"1", "true", "yes", "on"}
)
MIN_IMAGE_WIDTH = bounded_int_env("MIN_IMAGE_WIDTH", "120", minimum=64, maximum=4096)
MIN_IMAGE_HEIGHT = bounded_int_env("MIN_IMAGE_HEIGHT", "120", minimum=64, maximum=4096)
MIN_FACE_WIDTH = bounded_int_env("MIN_FACE_WIDTH", "30", minimum=20, maximum=2048)
MIN_FACE_HEIGHT = bounded_int_env("MIN_FACE_HEIGHT", "30", minimum=20, maximum=2048)
MIN_FACE_AREA_RATIO = bounded_float_env(
    "MIN_FACE_AREA_RATIO", "0.001", minimum=0.0001, maximum=1.0,
)
MIN_BLUR_SCORE = bounded_float_env(
    "MIN_BLUR_SCORE", "8", minimum=0.0, maximum=10000.0,
)
MIN_BRIGHTNESS = float(os.getenv("MIN_BRIGHTNESS", "35"))
MAX_BRIGHTNESS = float(os.getenv("MAX_BRIGHTNESS", "225"))
MIN_DETECTION_SIDE = int(os.getenv("MIN_DETECTION_SIDE", "640"))
MAX_DETECTION_SIDE = int(os.getenv("MAX_DETECTION_SIDE", "1600"))
MAX_IMAGE_BYTES = bounded_int_env(
    "MAX_IMAGE_BYTES", "2000000", minimum=100_000, maximum=10_000_000,
)
INFERENCE_CONCURRENCY = bounded_int_env(
    "INFERENCE_CONCURRENCY", "1", minimum=1, maximum=4,
)
MAX_ENROLLMENT_IMAGES = bounded_int_env(
    "MAX_ENROLLMENT_IMAGES", "3", minimum=1, maximum=5,
)
MIN_ENROLLMENT_SAMPLE_SIMILARITY = bounded_float_env(
    "MIN_ENROLLMENT_SAMPLE_SIMILARITY", "0.40", minimum=-1.0, maximum=1.0,
)
ENABLE_ANTI_SPOOFING = (
    os.getenv("ENABLE_ANTI_SPOOFING", "false").strip().lower()
    in {"1", "true", "yes", "on"}
)
AI_API_KEY = os.getenv("AI_API_KEY")
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
AI_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("AI_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
INFERENCE_SEMAPHORE = asyncio.Semaphore(INFERENCE_CONCURRENCY)
MODEL_READY = False
MODEL_STARTUP_ERROR: str | None = None

@asynccontextmanager
async def lifespan(_: FastAPI):
    await warmup_model()
    yield


app = FastAPI(
    title="Face Attendance AI Service",
    version="0.3.0",
    description="Face enrollment and recognition service for the MVP.",
    lifespan=lifespan,
)
if AI_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=AI_CORS_ORIGINS,
        allow_methods=["POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )


class FaceImageRequest(BaseModel):
    image: str = Field(
        min_length=1,
        max_length=2_700_000,
        description="Base64-encoded image or data URL",
    )


class EnrollRequest(BaseModel):
    employee_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]+$", max_length=100)
    student_id: int | None = Field(default=None, gt=0)
    image: str | None = Field(
        default=None,
        min_length=1,
        max_length=2_700_000,
        description="Backward-compatible single base64 image or data URL",
    )
    images: list[str] = Field(
        default_factory=list,
        max_length=MAX_ENROLLMENT_IMAGES,
        description="One to three enrollment photos of the same person",
    )

    @model_validator(mode="after")
    def validate_images(self) -> "EnrollRequest":
        resolved = self.resolved_images()
        if not resolved:
            raise ValueError("image or images is required")
        if any(not image or len(image) > 2_700_000 for image in resolved):
            raise ValueError("Each enrollment image must be valid and under the size limit")
        return self

    def resolved_images(self) -> list[str]:
        if self.images:
            return self.images
        return [self.image] if self.image else []

    def resolved_employee_id(self) -> str:
        if self.employee_id:
            return self.employee_id
        if self.student_id is not None:
            return str(self.student_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="employee_id or student_id is required",
        )


class EnrollResponse(BaseModel):
    employee_id: str
    embedding: list[float]
    model: str
    sample_count: int


class EmbeddingCandidate(BaseModel):
    employee_id: str | None = None
    student_id: int | None = Field(default=None, gt=0)
    vector: list[float] = Field(min_length=1, max_length=4096)

    @field_validator("vector")
    @classmethod
    def validate_vector(cls, vector: list[float]) -> list[float]:
        if not all(math.isfinite(value) for value in vector):
            raise ValueError("Embedding vector must contain only finite values")
        return vector

    def resolved_employee_id(self) -> str | None:
        if self.employee_id:
            return self.employee_id
        if self.student_id is not None:
            return str(self.student_id)
        return None


class RecognizeRequest(FaceImageRequest):
    embeddings: list[EmbeddingCandidate] = Field(max_length=5000)


class RecognitionResponse(BaseModel):
    matched: bool
    employee_id: str | None = None
    confidence: float | None = None
    reason: str | None = None
    best_score: float | None = None
    runner_up_score: float | None = None
    margin: float | None = None
    threshold_used: float | None = None


@dataclass(frozen=True)
class MatchResult:
    employee_id: str | None
    score: float | None
    runner_up_score: float | None

    @property
    def margin(self) -> float | None:
        if self.score is None or self.runner_up_score is None:
            return None
        return self.score - self.runner_up_score


def normalize_embedding(raw_embedding: list[float]) -> np.ndarray:
    embedding = np.asarray(raw_embedding, dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if norm == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Generated face embedding is invalid",
        )
    return embedding / norm


def validate_image_quality(image: np.ndarray) -> None:
    height, width = image.shape[:2]
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Image is too small for reliable face recognition; "
                f"use at least {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT}px"
            ),
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if blur_score < MIN_BLUR_SCORE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image is too blurry for reliable face recognition",
        )

    brightness = float(np.mean(gray))
    if brightness < MIN_BRIGHTNESS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image is too dark for reliable face recognition",
        )
    if brightness > MAX_BRIGHTNESS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image is too bright for reliable face recognition",
        )


def validate_face_quality(representation: dict, image: np.ndarray) -> None:
    facial_area = representation.get("facial_area")
    if not isinstance(facial_area, dict):
        return

    face_width = int(facial_area.get("w") or 0)
    face_height = int(facial_area.get("h") or 0)
    image_height, image_width = image.shape[:2]
    face_area_ratio = (
        (face_width * face_height) / float(image_width * image_height)
        if image_width and image_height
        else 0.0
    )

    if face_width < MIN_FACE_WIDTH or face_height < MIN_FACE_HEIGHT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Face is too small in the image; move closer to the camera",
        )
    if face_area_ratio < MIN_FACE_AREA_RATIO:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Face occupies too little of the image for reliable recognition",
        )


def prepare_image_for_detection(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    longest_side = max(height, width)
    if longest_side <= 0:
        return image

    scale = 1.0
    if longest_side < MIN_DETECTION_SIDE:
        scale = MIN_DETECTION_SIDE / float(longest_side)
    elif longest_side > MAX_DETECTION_SIDE:
        scale = MAX_DETECTION_SIDE / float(longest_side)

    if scale == 1.0:
        return image

    interpolation = cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=interpolation)


def crop_detection_variants(image: np.ndarray) -> list[np.ndarray]:
    """Return original plus practical crops for kiosk/mobile photos."""
    height, width = image.shape[:2]
    variants = [image]
    if height < 160 or width < 160:
        return variants

    upper_crop = image[0 : max(int(height * 0.72), 1), :]
    if upper_crop.shape[:2] != image.shape[:2]:
        variants.append(upper_crop)

    side = min(height, width)
    if side >= 160 and (height != width):
        y1 = max((height - side) // 3, 0)
        x1 = max((width - side) // 2, 0)
        center_crop = image[y1 : y1 + side, x1 : x1 + side]
        if center_crop.shape[0] >= 160 and center_crop.shape[1] >= 160:
            variants.append(center_crop)

    return variants


def detector_backends() -> list[str]:
    ordered_backends = [DETECTOR_BACKEND, *FALLBACK_DETECTOR_BACKENDS]
    unique_backends: list[str] = []
    for backend in ordered_backends:
        if backend not in unique_backends:
            unique_backends.append(backend)
    return unique_backends


def represent_single_face(
    image: np.ndarray,
    *,
    anti_spoofing: bool = False,
) -> np.ndarray:
    last_http_error: HTTPException | None = None

    for detector_backend in detector_backends():
        try:
            representations = DeepFace.represent(
                img_path=image,
                model_name=DEEPFACE_MODEL,
                detector_backend=detector_backend,
                enforce_detection=True,
                anti_spoofing=anti_spoofing,
            )
        except Exception as exc:
            if anti_spoofing and "spoof" in str(exc).casefold():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Liveness check failed; use a live camera view",
                ) from exc
            logger.info("Detector backend %s rejected image: %s", detector_backend, exc)
            continue

        if len(representations) == 0:
            last_http_error = HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No face was detected in the image",
            )
            continue
        if len(representations) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=MULTIPLE_FACES_DETAIL,
            )

        representation = representations[0]
        try:
            validate_face_quality(representation, image)
        except HTTPException as exc:
            last_http_error = exc
            continue

        raw_embedding = representation.get("embedding")
        if not isinstance(raw_embedding, list):
            last_http_error = HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Generated face embedding is invalid",
            )
            continue
        return normalize_embedding(raw_embedding)

    if last_http_error is not None:
        raise last_http_error
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="No usable face was detected in the image",
    )


def extract_embedding(
    image_base64: str,
    *,
    anti_spoofing: bool = False,
    augment: bool = False,
) -> list[float]:
    image = base64_to_image(image_base64, max_bytes=MAX_IMAGE_BYTES)
    validate_image_quality(image)
    last_error: HTTPException | None = None

    for variant in crop_detection_variants(image):
        detection_image = prepare_image_for_detection(variant)
        try:
            embeddings = [
                represent_single_face(detection_image, anti_spoofing=anti_spoofing),
            ]
            if augment:
                flipped_image = cv2.flip(detection_image, 1)
                flipped_embedding = represent_single_face(flipped_image, anti_spoofing=False)
                if flipped_embedding.shape == embeddings[0].shape:
                    embeddings.append(flipped_embedding)
            break
        except HTTPException as exc:
            # Cropping may help with a distant or off-center face, but it must
            # never turn a group photo into an accepted single-person scan.
            if exc.detail == MULTIPLE_FACES_DETAIL:
                raise
            last_error = exc
    else:
        if last_error is not None:
            raise last_error
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No usable face was detected in the image",
        )

    averaged_embedding = np.mean(np.stack(embeddings, axis=0), axis=0)
    normalized_average = normalize_embedding(averaged_embedding.tolist())
    return normalized_average.tolist()


def aggregate_embeddings(embeddings: list[list[float]]) -> list[float]:
    if not embeddings:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one usable enrollment photo is required",
        )

    vectors = [normalize_embedding(embedding) for embedding in embeddings]
    expected_shape = vectors[0].shape
    if any(vector.shape != expected_shape for vector in vectors[1:]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Enrollment photos produced incompatible face embeddings",
        )

    if len(vectors) > 1:
        lowest_similarity = min(
            float(np.dot(vectors[first], vectors[second]))
            for first in range(len(vectors))
            for second in range(first + 1, len(vectors))
        )
        if lowest_similarity < MIN_ENROLLMENT_SAMPLE_SIMILARITY:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Enrollment photos do not appear to show the same person. "
                    "Use clear photos of one student only."
                ),
            )

    centroid = np.mean(np.stack(vectors, axis=0), axis=0)
    return normalize_embedding(centroid.tolist()).tolist()


def extract_enrollment_embedding(images: list[str]) -> list[float]:
    return aggregate_embeddings(
        [
            extract_embedding(
                image,
                augment=ENABLE_ENROLLMENT_AUGMENTATION,
            )
            for image in images
        ],
    )


def find_best_match(
    query_embedding: list[float],
    candidates: list[EmbeddingCandidate],
) -> MatchResult:
    best_employee_id: str | None = None
    best_score: float | None = None
    runner_up_score: float | None = None

    for candidate in candidates:
        try:
            score = cosine_similarity(query_embedding, candidate.vector)
        except ValueError as exc:
            logger.warning("Skipping malformed candidate embedding: %s", exc)
            continue

        candidate_employee_id = candidate.resolved_employee_id()
        if candidate_employee_id is None:
            continue

        if best_score is None or score > best_score:
            runner_up_score = best_score
            best_score = score
            best_employee_id = candidate_employee_id
        elif runner_up_score is None or score > runner_up_score:
            runner_up_score = score

    return MatchResult(
        employee_id=best_employee_id,
        score=best_score,
        runner_up_score=runner_up_score,
    )


def initialize_models() -> None:
    """Load both recognition and detection models before declaring readiness."""
    DeepFace.build_model(model_name=DEEPFACE_MODEL, task="facial_recognition")
    dummy = np.zeros((224, 224, 3), dtype=np.uint8)
    errors: list[str] = []
    for detector_backend in detector_backends():
        try:
            DeepFace.extract_faces(img_path=dummy, detector_backend=detector_backend, enforce_detection=False)
            return
        except Exception as exc:
            errors.append(f"{detector_backend}: {exc}")
    raise RuntimeError("No configured face detector is available: " + " | ".join(errors))


async def warmup_model() -> None:
    """Pre-download and validate the configured DeepFace runtime."""
    global MODEL_READY, MODEL_STARTUP_ERROR

    logger.info(
        "Warming up DeepFace %s model and %s detector",
        DEEPFACE_MODEL,
        DETECTOR_BACKEND,
    )
    try:
        await run_in_threadpool(initialize_models)
        MODEL_READY = True
        MODEL_STARTUP_ERROR = None
        logger.info("Face recognition runtime ready")
    except Exception as exc:
        MODEL_READY = False
        MODEL_STARTUP_ERROR = type(exc).__name__
        logger.exception("Face recognition warmup failed")


@app.get("/", tags=["health"])
async def root_health_check() -> dict[str, str]:
    return {"status": "ok", "service": "face-attendance-ai"}


@app.get("/health", tags=["health"])
async def health_check(
    response: Response,
) -> dict[str, str | float | int | bool | list[str] | None]:
    if not MODEL_READY:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if MODEL_READY else "error",
        "model_ready": MODEL_READY,
        "startup_error": MODEL_STARTUP_ERROR,
        "model": DEEPFACE_MODEL,
        "detector_backend": DETECTOR_BACKEND,
        "fallback_detector_backends": FALLBACK_DETECTOR_BACKENDS,
        "recognition_threshold": RECOGNITION_THRESHOLD,
        "recognition_margin": RECOGNITION_MARGIN,
        "min_face_width": MIN_FACE_WIDTH,
        "min_face_height": MIN_FACE_HEIGHT,
        "min_face_area_ratio": MIN_FACE_AREA_RATIO,
        "min_blur_score": MIN_BLUR_SCORE,
        "max_image_bytes": MAX_IMAGE_BYTES,
        "inference_concurrency": INFERENCE_CONCURRENCY,
        "max_enrollment_images": MAX_ENROLLMENT_IMAGES,
        "min_enrollment_sample_similarity": MIN_ENROLLMENT_SAMPLE_SIMILARITY,
        "enrollment_augmentation": ENABLE_ENROLLMENT_AUGMENTATION,
        "recognition_augmentation": ENABLE_RECOGNITION_AUGMENTATION,
        "anti_spoofing": ENABLE_ANTI_SPOOFING,
        "api_key_required": bool(AI_API_KEY),
    }


def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if APP_ENV == "production" and not AI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI_API_KEY is required in production",
        )
    if not AI_API_KEY:
        return
    if x_api_key is None or not hmac.compare_digest(x_api_key, AI_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")


def verify_model_ready() -> None:
    if not MODEL_READY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition model is not ready",
        )


@app.post(
    "/enroll",
    response_model=EnrollResponse,
    dependencies=[Depends(verify_api_key), Depends(verify_model_ready)],
)
async def enroll(payload: EnrollRequest) -> EnrollResponse:
    images = payload.resolved_images()
    async with INFERENCE_SEMAPHORE:
        embedding = await run_in_threadpool(extract_enrollment_embedding, images)
    return EnrollResponse(
        employee_id=payload.resolved_employee_id(),
        embedding=embedding,
        model=DEEPFACE_MODEL,
        sample_count=len(images),
    )


@app.post(
    "/recognize",
    response_model=RecognitionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(verify_api_key), Depends(verify_model_ready)],
)
async def recognize(payload: RecognizeRequest) -> RecognitionResponse:
    if not payload.embeddings:
        return RecognitionResponse(matched=False, reason="no_candidates")

    async with INFERENCE_SEMAPHORE:
        query_embedding = await run_in_threadpool(
            extract_embedding,
            payload.image,
            anti_spoofing=ENABLE_ANTI_SPOOFING,
            augment=ENABLE_RECOGNITION_AUGMENTATION,
        )
        match = await run_in_threadpool(
            find_best_match,
            query_embedding,
            payload.embeddings,
        )

    if match.employee_id is None or match.score is None:
        return RecognitionResponse(matched=False, reason="no_valid_candidates")

    best_score = round(match.score, 4)
    runner_up_score = (
        round(match.runner_up_score, 4)
        if match.runner_up_score is not None
        else None
    )
    margin = round(match.margin, 4) if match.margin is not None else None

    if match.score < RECOGNITION_THRESHOLD:
        return RecognitionResponse(
            matched=False,
            reason="below_threshold",
            best_score=best_score,
            runner_up_score=runner_up_score,
            margin=margin,
            threshold_used=RECOGNITION_THRESHOLD,
        )

    if match.runner_up_score is not None and match.margin is not None:
        if match.margin < RECOGNITION_MARGIN:
            return RecognitionResponse(
                matched=False,
                reason="ambiguous_match",
                best_score=best_score,
                runner_up_score=runner_up_score,
                margin=margin,
                threshold_used=RECOGNITION_THRESHOLD,
            )

    if match.employee_id is None:
        return RecognitionResponse(matched=False, reason="no_valid_candidates")

    return RecognitionResponse(
        matched=True,
        employee_id=match.employee_id,
        confidence=round(max(0.0, min(match.score, 1.0)), 4),
        best_score=best_score,
        runner_up_score=runner_up_score,
        margin=margin,
        threshold_used=RECOGNITION_THRESHOLD,
    )
