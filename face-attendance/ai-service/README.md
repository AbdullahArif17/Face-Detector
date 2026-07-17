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
- Variable: `RECOGNITION_THRESHOLD=0.42`
- Variable: `RECOGNITION_MARGIN=0.03`
- Variable: `DETECTOR_BACKEND=retinaface`
- Variable: `FALLBACK_DETECTOR_BACKENDS=opencv,ssd,mtcnn`
- Variable: `ENABLE_ENROLLMENT_AUGMENTATION=true`
- Variable: `ENABLE_RECOGNITION_AUGMENTATION=false`
- Variable: `MIN_FACE_AREA_RATIO=0.001`
- Variable: `MAX_ENROLLMENT_IMAGES=3`
- Variable: `MIN_ENROLLMENT_SAMPLE_SIMILARITY=0.40`
- Variable: `INFERENCE_CONCURRENCY=1`

`POST /enroll` accepts either the backward-compatible `image` field or an
`images` array containing up to three photos. For better recognition, enroll
two or three clear photos of the same student with small pose differences.

RetinaFace provides more stable alignment than the OpenCV detector for side
angles. Enrollment uses horizontal-flip augmentation for a stronger stored
template; live recognition uses one pass to keep CPU latency practical.

The Docker build preloads the default ArcFace and RetinaFace weights. This makes
Space startup deterministic and avoids downloading model files during the first
real enrollment or scan.

The image uses Python 3.11 and pins a patched Keras release. Keep those versions
aligned with `requirements.txt`; Python 3.10 cannot install the patched Keras line.

`ENABLE_ANTI_SPOOFING=false` keeps uploaded-photo kiosk fallback compatible.
Enable it only for live-camera-only kiosks after validating the deployment hardware;
static photos are intentionally rejected when liveness checking is enabled.
