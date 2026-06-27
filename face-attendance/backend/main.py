from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import attendance, auth, companies, employees, face

app = FastAPI(
    title="Face Attendance API",
    version="0.1.0",
    description="Core API for the AI Face Recognition Attendance SaaS.",
)

# TODO: Restrict origins to configured frontend domains before production deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(face.router)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
