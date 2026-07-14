---
title: Face Attendance AI Service
emoji: 📸
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# Face Attendance AI Service

FastAPI + DeepFace face recognition service for the school attendance system.

## Endpoints

- `GET /` — service health check
- `GET /health` — model health check
- `POST /enroll` — enroll a student face and return an embedding vector
- `POST /recognize` — recognize a face against stored embedding vectors

## Hugging Face configuration

Set these Space variables/secrets before production use:

- Secret: `AI_API_KEY` (must match the backend)
- Variable: `APP_ENV=production`
- Variable: `RECOGNITION_THRESHOLD=0.58`
- Variable: `RECOGNITION_MARGIN=0.03`
- Variable: `MIN_FACE_AREA_RATIO=0.001`
- Variable: `MAX_ENROLLMENT_IMAGES=3`
- Variable: `MIN_ENROLLMENT_SAMPLE_SIMILARITY=0.40`
- Variable: `INFERENCE_CONCURRENCY=1`

`POST /enroll` accepts either the backward-compatible `image` field or an
`images` array containing up to three photos. For better recognition, enroll
two or three clear photos of the same student with small pose differences.

`ENABLE_ANTI_SPOOFING=false` keeps uploaded-photo kiosk fallback compatible.
Enable it only for live-camera-only kiosks after validating the deployment hardware;
static photos are intentionally rejected when liveness checking is enabled.
