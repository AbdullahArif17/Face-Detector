import hmac
import os
import sys

import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
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
DEEPFACE_MODEL = os.getenv("DEEPFACE_MODEL", "Facenet")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "retinaface")
AI_API_KEY = os.getenv("AI_API_KEY")

if not AI_API_KEY:
    raise RuntimeError("AI_API_KEY is not configured")

app = FastAPI(
    title="Face Attendance AI Service",
    version="0.2.0",
    description="Face enrollment and recognition service for the MVP.",
)


class FaceImageRequest(BaseModel):
    image: str = Field(min_length=1, description="Base64-encoded image or data URL")


class EnrollRequest(FaceImageRequest):
    employee_id: str = Field(pattern=r"^[A-Za-z0-9_-]+$", max_length=100)


class EnrollResponse(BaseModel):
    employee_id: str
    embedding: list[float]
    model: str


class EmbeddingCandidate(BaseModel):
    employee_id: str
    vector: list[float] = Field(min_length=1)


class RecognizeRequest(FaceImageRequest):
    embeddings: list[EmbeddingCandidate]


class RecognitionResponse(BaseModel):
    matched: bool
    employee_id: str | None = None
    confidence: float | None = None


def extract_embedding(image_base64: str) -> list[float]:
    image = base64_to_image(image_base64)
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

    embedding = np.asarray(representations[0]["embedding"], dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if norm == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Generated face embedding is invalid",
        )
    return (embedding / norm).tolist()


def find_best_match(
    query_embedding: list[float],
    candidates: list[EmbeddingCandidate],
) -> tuple[str | None, float | None]:
    best_employee_id: str | None = None
    best_score: float | None = None

    for candidate in candidates:
        try:
            score = cosine_similarity(query_embedding, candidate.vector)
        except ValueError:
            # TODO: Emit structured logs for malformed candidate embeddings.
            continue

        if best_score is None or score > best_score:
            best_score = score
            best_employee_id = candidate.employee_id

    return best_employee_id, best_score


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if not hmac.compare_digest(x_api_key, AI_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")


@app.post("/enroll", response_model=EnrollResponse, dependencies=[Depends(verify_api_key)])
async def enroll(payload: EnrollRequest) -> EnrollResponse:
    embedding = await run_in_threadpool(extract_embedding, payload.image)
    return EnrollResponse(
        employee_id=payload.employee_id,
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
    best_employee_id, best_score = await run_in_threadpool(
        find_best_match,
        query_embedding,
        payload.embeddings,
    )

    if best_employee_id is None or best_score is None or best_score <= RECOGNITION_THRESHOLD:
        return RecognitionResponse(matched=False)

    return RecognitionResponse(
        matched=True,
        employee_id=best_employee_id,
        confidence=round(max(0.0, min(best_score, 1.0)), 4),
    )
