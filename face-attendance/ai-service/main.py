import hmac
import os
import sys
from dataclasses import dataclass

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
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

RECOGNITION_THRESHOLD = float(os.getenv("RECOGNITION_THRESHOLD", "0.7"))
RECOGNITION_MARGIN = float(os.getenv("RECOGNITION_MARGIN", "0.05"))
DEEPFACE_MODEL = os.getenv("DEEPFACE_MODEL", "ArcFace")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "retinaface")
ENABLE_EMBEDDING_AUGMENTATION = (
    os.getenv("ENABLE_EMBEDDING_AUGMENTATION", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
MIN_IMAGE_WIDTH = int(os.getenv("MIN_IMAGE_WIDTH", "180"))
MIN_IMAGE_HEIGHT = int(os.getenv("MIN_IMAGE_HEIGHT", "180"))
MIN_FACE_WIDTH = int(os.getenv("MIN_FACE_WIDTH", "70"))
MIN_FACE_HEIGHT = int(os.getenv("MIN_FACE_HEIGHT", "70"))
MIN_FACE_AREA_RATIO = float(os.getenv("MIN_FACE_AREA_RATIO", "0.03"))
MIN_BLUR_SCORE = float(os.getenv("MIN_BLUR_SCORE", "20"))
MIN_BRIGHTNESS = float(os.getenv("MIN_BRIGHTNESS", "35"))
MAX_BRIGHTNESS = float(os.getenv("MAX_BRIGHTNESS", "225"))
AI_API_KEY = os.getenv("AI_API_KEY")

app = FastAPI(
    title="Face Attendance AI Service",
    version="0.2.0",
    description="Face enrollment and recognition service for the MVP.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class FaceImageRequest(BaseModel):
    image: str = Field(min_length=1, description="Base64-encoded image or data URL")


class EnrollRequest(FaceImageRequest):
    employee_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]+$", max_length=100)
    student_id: int | None = Field(default=None, gt=0)

    def resolved_employee_id(self) -> str:
        if self.employee_id:
            return self.employee_id
        if self.student_id is not None:
            return str(self.student_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="employee_id or student_id is required",
        )


class EnrollResponse(BaseModel):
    employee_id: str
    embedding: list[float]
    model: str


class EmbeddingCandidate(BaseModel):
    employee_id: str | None = None
    student_id: int | None = Field(default=None, gt=0)
    vector: list[float] = Field(min_length=1)

    def resolved_employee_id(self) -> str | None:
        if self.employee_id:
            return self.employee_id
        if self.student_id is not None:
            return str(self.student_id)
        return None


class RecognizeRequest(FaceImageRequest):
    embeddings: list[EmbeddingCandidate]


class RecognitionResponse(BaseModel):
    matched: bool
    employee_id: str | None = None
    confidence: float | None = None


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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Generated face embedding is invalid",
        )
    return embedding / norm


def validate_image_quality(image: np.ndarray) -> None:
    height, width = image.shape[:2]
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Image is too small for reliable face recognition; "
                f"use at least {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT}px"
            ),
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if blur_score < MIN_BLUR_SCORE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image is too blurry for reliable face recognition",
        )

    brightness = float(np.mean(gray))
    if brightness < MIN_BRIGHTNESS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image is too dark for reliable face recognition",
        )
    if brightness > MAX_BRIGHTNESS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Face is too small in the image; move closer to the camera",
        )
    if face_area_ratio < MIN_FACE_AREA_RATIO:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Face occupies too little of the image for reliable recognition",
        )


def represent_single_face(image: np.ndarray) -> np.ndarray:
    try:
        representations = DeepFace.represent(
            img_path=image,
            model_name=DEEPFACE_MODEL,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True,
        )
    except Exception as exc:
        # TODO: Replace broad DeepFace exception handling with typed domain errors.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No usable face was detected in the image",
        ) from exc

    if len(representations) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No face was detected in the image",
        )
    if len(representations) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Multiple faces were detected; exactly one face is required",
        )

    representation = representations[0]
    validate_face_quality(representation, image)
    raw_embedding = representation.get("embedding")
    if not isinstance(raw_embedding, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Generated face embedding is invalid",
        )
    return normalize_embedding(raw_embedding)


def extract_embedding(image_base64: str) -> list[float]:
    image = base64_to_image(image_base64)
    validate_image_quality(image)

    embeddings = [represent_single_face(image)]
    if ENABLE_EMBEDDING_AUGMENTATION:
        flipped_image = cv2.flip(image, 1)
        flipped_embedding = represent_single_face(flipped_image)
        if flipped_embedding.shape == embeddings[0].shape:
            embeddings.append(flipped_embedding)

    averaged_embedding = np.mean(np.stack(embeddings, axis=0), axis=0)
    normalized_average = normalize_embedding(averaged_embedding.tolist())
    return normalized_average.tolist()


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
        except ValueError:
            # TODO: Emit structured logs for malformed candidate embeddings.
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


@app.on_event("startup")
async def warmup_model() -> None:
    """Pre-download and load the configured DeepFace model on container startup."""
    print(f"Warming up DeepFace {DEEPFACE_MODEL} model...")
    try:
        dummy = np.zeros((224, 224, 3), dtype=np.uint8)
        await run_in_threadpool(
            DeepFace.represent,
            img_path=dummy,
            model_name=DEEPFACE_MODEL,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False,
        )
        print("Model ready")
    except Exception as exc:
        print(f"Warmup error (non-fatal): {exc}")


@app.get("/", tags=["health"])
async def root_health_check() -> dict[str, str]:
    return {"status": "ok", "service": "face-attendance-ai"}


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "model": DEEPFACE_MODEL,
        "detector_backend": DETECTOR_BACKEND,
    }


def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not AI_API_KEY:
        return
    if x_api_key is None or not hmac.compare_digest(x_api_key, AI_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")


@app.post("/enroll", response_model=EnrollResponse, dependencies=[Depends(verify_api_key)])
async def enroll(payload: EnrollRequest) -> EnrollResponse:
    embedding = await run_in_threadpool(extract_embedding, payload.image)
    return EnrollResponse(
        employee_id=payload.resolved_employee_id(),
        embedding=embedding,
        model=DEEPFACE_MODEL,
    )


@app.post(
    "/recognize",
    response_model=RecognitionResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(verify_api_key)],
)
async def recognize(payload: RecognizeRequest) -> RecognitionResponse:
    if not payload.embeddings:
        return RecognitionResponse(matched=False)

    query_embedding = await run_in_threadpool(extract_embedding, payload.image)
    match = await run_in_threadpool(
        find_best_match,
        query_embedding,
        payload.embeddings,
    )

    if match.employee_id is None or match.score is None:
        return RecognitionResponse(matched=False)

    if match.score <= RECOGNITION_THRESHOLD:
        return RecognitionResponse(matched=False)

    if match.runner_up_score is not None and match.margin is not None:
        if match.margin < RECOGNITION_MARGIN:
            return RecognitionResponse(matched=False)

    if match.employee_id is None:
        return RecognitionResponse(matched=False)

    return RecognitionResponse(
        matched=True,
        employee_id=match.employee_id,
        confidence=round(max(0.0, min(match.score, 1.0)), 4),
    )
