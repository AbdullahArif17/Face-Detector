import base64
from datetime import date
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.core import biometrics
from app.core.images import MAX_IMAGE_BYTES, normalize_base64_image
from app.core.phones import normalize_pakistan_phone
from app.core.time import local_day_bounds, to_local
from app.routers.attendance import (
    csv_safe,
    expire_stale_attendance_sessions,
)
from app.schemas.whatsapp import WhatsappTestRequest
from app.schemas.face import FaceEnrollRequest
from app.services.absent_scheduler import send_absent_alerts
from app.services import whatsapp


def test_local_day_bounds_use_pakistan_timezone() -> None:
    start, end = local_day_bounds(date(2026, 7, 11))

    assert start.isoformat() == "2026-07-10T19:00:00+00:00"
    assert end.isoformat() == "2026-07-11T19:00:00+00:00"
    assert to_local(start).date() == date(2026, 7, 11)


def test_image_normalization_rejects_oversized_payload() -> None:
    oversized = base64.b64encode(b"x" * (MAX_IMAGE_BYTES + 1)).decode("ascii")

    with pytest.raises(HTTPException) as error:
        normalize_base64_image(oversized)

    assert error.value.status_code == 413


def test_face_enrollment_accepts_multiple_samples() -> None:
    request = FaceEnrollRequest(images=["first", "second"])

    assert request.resolved_images() == ["first", "second"]


def test_csv_safe_blocks_spreadsheet_formula_prefixes() -> None:
    assert csv_safe("=HYPERLINK('https://example.com')").startswith("'")
    assert csv_safe("Student Name") == "Student Name"


def test_pakistan_phone_normalization() -> None:
    assert normalize_pakistan_phone("0336-2725979") == "923362725979"
    assert WhatsappTestRequest(phone="03362725979", message="test").phone == "03362725979"


@pytest.mark.asyncio
async def test_stale_attendance_session_is_expired_before_new_start() -> None:
    stale_session = SimpleNamespace(
        status="active",
        stopped_at=None,
        stopped_by_id=None,
    )

    class FakeSession:
        flushed = False

        async def scalars(self, _query: object) -> list[SimpleNamespace]:
            return [stale_session]

        async def flush(self) -> None:
            self.flushed = True

    fake_session = FakeSession()
    await expire_stale_attendance_sessions(
        fake_session,  # type: ignore[arg-type]
        company_id=1,
        branch_id=2,
        stopped_by_id=3,
    )

    assert stale_session.status == "expired"
    assert stale_session.stopped_at is not None
    assert stale_session.stopped_by_id == 3
    assert fake_session.flushed is True


@pytest.mark.asyncio
async def test_absent_cron_is_disabled_for_realtime_sessions() -> None:
    result = await send_absent_alerts(SimpleNamespace())

    assert result["disabled"] is True
    assert result["processed"] == 0


@pytest.mark.asyncio
async def test_whatsapp_test_mode_blocks_other_recipients(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        whatsapp,
        "settings",
        type(
            "TestSettings",
            (),
            {
                "whatsapp_test_mode": True,
                "whatsapp_test_recipient": "923362725979",
            },
        )(),
    )

    result = await whatsapp.send_meta_message(
        phone_number_id="test-phone-id",
        access_token="test-token",
        payload={"to": "923001234567", "type": "text"},
    )

    assert result["success"] is False
    assert result["message_id"] is None
    assert "test mode" in str(result["error"])


def test_embedding_encryption_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        biometrics,
        "settings",
        type(
            "TestSettings",
            (),
            {
                "biometric_encryption_key": Fernet.generate_key().decode("utf-8"),
                "app_env": "production",
            },
        )(),
    )
    vector = [0.1, 0.2, 0.3]

    ciphertext, legacy_vector = biometrics.prepare_embedding_storage(vector)

    assert ciphertext is not None
    assert legacy_vector is None
    assert biometrics.read_embedding(
        ciphertext=ciphertext,
        legacy_vector=None,
    ) == pytest.approx(vector)
