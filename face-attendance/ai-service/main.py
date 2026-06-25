import base64
import binascii
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

# DeepFace emits Unicode status symbols while downloading model weights. Windows
# PowerShell may otherwise expose a legacy cp1252 stream and fail before download.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from deepface import DeepFace  # noqa: E402

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
EMBEDDINGS_DIR = BASE_DIR / os.getenv("EMBEDDINGS_DIR", "embeddings")
RECOGNITION_THRESHOLD = float(os.getenv("RECOGNITION_THRESHOLD", "0.65"))
DEEPFACE_MODEL = os.getenv("DEEPFACE_MODEL", "Facenet512")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "retinaface")

EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Face Attendance AI Service",
    version="0.1.0",
    description="Face enrollment and recognition service for the MVP.",
)


class FaceImageRequest(BaseModel):
    image: str = Field(min_length=1, description="Base64-encoded image or data URL")


class EnrollRequest(FaceImageRequest):
    employee_id: str = Field(pattern=r"^[A-Za-z0-9_-]+$", max_length=100)


class EnrollResponse(BaseModel):
    employee_id: str
    embedding: list[float]


class RecognitionResponse(BaseModel):
    employee_id: str
    confidence_score: float


def decode_image(image_base64: str) -> np.ndarray:
    encoded = image_base64.split(",", 1)[-1]
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image is not valid base64",
        ) from exc

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image could not be decoded",
        )
    return image


def extract_embedding(image: np.ndarray) -> np.ndarray:
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

    if len(representations) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Exactly one face is required",
        )

    embedding = np.asarray(representations[0]["embedding"], dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if norm == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Generated face embedding is invalid",
        )
    return embedding / norm


def find_best_match(query_embedding: np.ndarray) -> tuple[str | None, float]:
    best_employee_id: str | None = None
    best_score = -1.0

    for embedding_path in EMBEDDINGS_DIR.glob("*.npy"):
        try:
            stored_embedding = np.load(embedding_path, allow_pickle=False)
            stored_norm = np.linalg.norm(stored_embedding)
            if stored_norm == 0 or stored_embedding.shape != query_embedding.shape:
                continue
            score = float(np.dot(query_embedding, stored_embedding / stored_norm))
        except (OSError, ValueError):
            # TODO: Emit structured logs and quarantine malformed embedding files.
            continue

        if score > best_score:
            best_score = score
            best_employee_id = embedding_path.stem

    return best_employee_id, best_score


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/enroll", response_model=EnrollResponse)
async def enroll(payload: EnrollRequest) -> EnrollResponse:
    image = decode_image(payload.image)
    embedding = await run_in_threadpool(extract_embedding, image)

    # TODO: Move encrypted embeddings to tenant-isolated persistent storage.
    await run_in_threadpool(
        np.save,
        EMBEDDINGS_DIR / f"{payload.employee_id}.npy",
        embedding,
    )

    return EnrollResponse(
        employee_id=payload.employee_id,
        embedding=embedding.tolist(),
    )


@app.post("/recognize", response_model=RecognitionResponse)
async def recognize(payload: FaceImageRequest) -> RecognitionResponse:
    image = decode_image(payload.image)
    query_embedding = await run_in_threadpool(extract_embedding, image)
    best_employee_id, best_score = await run_in_threadpool(
        find_best_match,
        query_embedding,
    )

    if best_employee_id is None or best_score < RECOGNITION_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching employee found",
        )

    return RecognitionResponse(
        employee_id=best_employee_id,
        confidence_score=round(max(0.0, min(best_score, 1.0)), 4),
    )
