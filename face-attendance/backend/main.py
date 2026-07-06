from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import attendance, auth, companies, employees, face, students, users, whatsapp

from contextlib import asynccontextmanager
import httpx
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.config import settings
from app.core.rate_limit import limiter
from app.services.absent_scheduler import create_absent_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient()
    app.state.absent_scheduler = create_absent_scheduler()
    app.state.absent_scheduler.start()
    yield
    app.state.absent_scheduler.shutdown(wait=False)
    await app.state.http_client.aclose()

app = FastAPI(
    title="Face Attendance API",
    version="0.1.0",
    description="Core API for the AI Face Recognition Attendance SaaS.",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# TODO: Restrict origins to configured frontend domains before production deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(employees.router)
app.include_router(students.router)
app.include_router(attendance.router)
app.include_router(face.router)
app.include_router(users.router)
app.include_router(whatsapp.router)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
