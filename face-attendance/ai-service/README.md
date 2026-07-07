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
