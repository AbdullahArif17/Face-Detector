# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TF_USE_LEGACY_KERAS=1 \
    HOME=/home/appuser

# Install system dependencies required by OpenCV and DeepFace.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin appuser

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    export PIP_CACHE_DIR=/root/.cache/pip \
    && pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt \
    && pip uninstall -y opencv-python \
    && pip install --force-reinstall --no-deps opencv-python-headless==4.13.0.92

# Bundle the default recognition and detector weights into the image so a
# Space restart does not depend on a model download during the first scan.
RUN python -c "import numpy as np; from deepface import DeepFace; DeepFace.build_model(model_name='ArcFace', task='facial_recognition'); DeepFace.extract_faces(img_path=np.zeros((224,224,3), dtype=np.uint8), detector_backend='retinaface', enforce_detection=False)" \
    && chown -R appuser:appuser /home/appuser/.deepface

COPY --chown=appuser:appuser . .

USER appuser

# HuggingFace Spaces Docker apps listen on port 7860.
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=4)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
