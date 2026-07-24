import base64
from datetime import date
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from starlette.responses import Response

from app.core import biometrics
from app.core import credentials
from app.core.images import (
    MAX_IMAGE_BYTES,
    THUMBNAIL_MAX_SIDE,
    make_profile_thumbnail,
    normalize_base64_image,
)
from app.core.phones import normalize_pakistan_phone
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    set_auth_cookies,
)
from app.core.time import local_day_bounds, to_local
from app.routers.attendance import (
    csv_safe,
    expire_stale_attendance_sessions,
)
from app.routers.face import should_update_profile_image, unenroll_face
from app.routers.companies import ensure_company_access
from app.routers.users import ensure_can_manage_user, resolve_user_company_id
from app.schemas.whatsapp import WhatsappTestRequest
from app.schemas.face import FaceEnrollRequest
from app.schemas.auth import SignupRequest
from app.schemas.company import SchoolSettingsUpdate
from app.schemas.user import UserCreate
from app.services import whatsapp
import main as backend_main


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


def test_profile_thumbnail_is_small_jpeg() -> None:
    from io import BytesIO

    from PIL import Image

    source = Image.new("RGB", (1200, 800), color=(80, 120, 160))
    buffer = BytesIO()
    source.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

    thumbnail_data_url = make_profile_thumbnail(
        f"data:image/png;base64,{encoded}",
    )
    thumbnail_bytes = base64.b64decode(thumbnail_data_url.split(",", 1)[1])
    with Image.open(BytesIO(thumbnail_bytes)) as thumbnail:
        assert thumbnail.format == "JPEG"
        assert max(thumbnail.size) <= THUMBNAIL_MAX_SIDE
    assert len(thumbnail_bytes) < len(buffer.getvalue())


def test_face_enrollment_accepts_multiple_samples() -> None:
    request = FaceEnrollRequest(images=["first", "second"])

    assert request.resolved_images() == ["first", "second"]


def test_face_enrollment_preserves_profile_image_unless_requested() -> None:
    assert not should_update_profile_image(
        requested=None,
        current_profile_image="existing-thumbnail",
    )
    assert should_update_profile_image(
        requested=None,
        current_profile_image=None,
    )
    assert not should_update_profile_image(
        requested=False,
        current_profile_image=None,
    )
    assert should_update_profile_image(
        requested=True,
        current_profile_image="existing-thumbnail",
    )


@pytest.mark.asyncio
async def test_face_unenrollment_retains_profile_image() -> None:
    student = SimpleNamespace(
        id=7,
        school_id=3,
        profile_image="existing-thumbnail",
    )
    embedding = SimpleNamespace(id=11)

    class FakeSession:
        deleted: object | None = None
        committed = False

        async def get(self, _model: object, _record_id: int) -> SimpleNamespace:
            return student

        async def scalar(self, _query: object) -> SimpleNamespace:
            return embedding

        async def delete(self, record: object) -> None:
            self.deleted = record

        async def commit(self) -> None:
            self.committed = True

    session = FakeSession()
    result = await unenroll_face(
        7,
        session=session,  # type: ignore[arg-type]
        current_user=SimpleNamespace(company_id=3),  # type: ignore[arg-type]
    )

    assert session.deleted is embedding
    assert session.committed
    assert student.profile_image == "existing-thumbnail"
    assert result.profile_image == "existing-thumbnail"


def test_csv_safe_blocks_spreadsheet_formula_prefixes() -> None:
    assert csv_safe("=HYPERLINK('https://example.com')").startswith("'")
    assert csv_safe("Student Name") == "Student Name"


def test_access_tokens_include_required_security_claims() -> None:
    token = create_access_token({"sub": "7", "company_id": 8, "role": "admin"})

    payload = decode_access_token(token)

    assert payload["sub"] == "7"
    assert payload["company_id"] == 8
    assert payload["typ"] == "access"
    assert payload["iss"]
    assert payload["aud"]
    assert payload["jti"]


def test_auth_cookies_use_httponly_for_session_only() -> None:
    response = Response()

    set_auth_cookies(response, "signed-token")

    cookies = response.headers.getlist("set-cookie")
    assert len(cookies) == 2
    assert "HttpOnly" in cookies[0]
    assert "HttpOnly" not in cookies[1]
    assert "SameSite=lax" in cookies[0]


@pytest.mark.asyncio
async def test_cookie_authenticated_writes_require_csrf_and_are_not_cached() -> None:
    transport = ASGITransport(app=backend_main.app)
    async with AsyncClient(transport=transport, base_url="https://testserver") as client:
        client.cookies.set(
            backend_main.settings.auth_cookie_name,
            "invalid-session-is-enough-to-trigger-csrf-middleware",
        )
        response = await client.post("/auth/logout")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF validation failed"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_bcrypt_password_limit_is_validated() -> None:
    with pytest.raises(ValueError):
        hash_password("a" * 73)

    with pytest.raises(ValidationError):
        SignupRequest(
            company_name="Demo School",
            name="Admin",
            email="admin@example.com",
            password="a" * 73,
        )


def test_user_creation_is_locked_to_authenticated_organization() -> None:
    current_user = SimpleNamespace(company_id=8, role="super_admin")

    assert resolve_user_company_id(current_user, None) == 8  # type: ignore[arg-type]
    assert resolve_user_company_id(current_user, 8) == 8  # type: ignore[arg-type]

    with pytest.raises(HTTPException) as error:
        resolve_user_company_id(current_user, 9)  # type: ignore[arg-type]

    assert error.value.status_code == 403
    assert "current organization" in str(error.value.detail)


def test_user_create_rejects_privilege_fields() -> None:
    with pytest.raises(ValidationError):
        UserCreate.model_validate(
            {
                "name": "Tenant User",
                "email": "tenant-user@example.com",
                "password": "strong-password",
                "role": "hr",
                "is_active": True,
            },
        )


def test_cross_organization_user_management_is_hidden_even_from_super_admin() -> None:
    current_user = SimpleNamespace(company_id=8, role="super_admin")
    other_organization_user = SimpleNamespace(company_id=9, role="admin")

    with pytest.raises(HTTPException) as error:
        ensure_can_manage_user(
            current_user,  # type: ignore[arg-type]
            other_organization_user,  # type: ignore[arg-type]
        )

    assert error.value.status_code == 404
    assert error.value.detail == "User not found"


def test_company_settings_are_tenant_scoped_even_for_super_admin() -> None:
    current_user = SimpleNamespace(company_id=8, role="super_admin")

    ensure_company_access(current_user, 8)  # type: ignore[arg-type]
    with pytest.raises(HTTPException) as error:
        ensure_company_access(current_user, 9)  # type: ignore[arg-type]

    assert error.value.status_code == 404
    assert error.value.detail == "Organization not found"


def test_organization_admin_cannot_manage_super_admin() -> None:
    current_user = SimpleNamespace(company_id=8, role="admin")
    protected_user = SimpleNamespace(company_id=8, role="super_admin")

    with pytest.raises(HTTPException) as error:
        ensure_can_manage_user(
            current_user,  # type: ignore[arg-type]
            protected_user,  # type: ignore[arg-type]
        )

    assert error.value.status_code == 403


def test_school_settings_reject_organization_whatsapp_credentials() -> None:
    with pytest.raises(ValidationError):
        SchoolSettingsUpdate.model_validate(
            {
                "school_phone": "923001111111",
                "whatsapp_token": "organization-token",
            },
        )


def test_whatsapp_credentials_always_use_backend_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        whatsapp,
        "settings",
        SimpleNamespace(
            meta_whatsapp_token="shared-token",
            meta_phone_number_id="shared-phone-id",
        ),
    )
    organization = SimpleNamespace(
        whatsapp_token="organization-token",
        whatsapp_phone_id="organization-phone-id",
    )

    assert whatsapp.get_whatsapp_credentials(organization) == (  # type: ignore[arg-type]
        "shared-token",
        "shared-phone-id",
    )


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
        stopped_by_id=3,
    )

    assert stale_session.status == "expired"
    assert stale_session.stopped_at is not None
    assert stale_session.stopped_by_id == 3
    assert fake_session.flushed is True


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


@pytest.mark.asyncio
async def test_attendance_template_parameter_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, list[str]] = {}

    async def fake_send_template_message(**kwargs: object) -> dict[str, str | bool | None]:
        captured[str(kwargs["template_name"])] = list(kwargs["body_parameters"])  # type: ignore[arg-type]
        return {"success": True, "message_id": "wamid.test", "error": None}

    monkeypatch.setattr(
        whatsapp,
        "settings",
        SimpleNamespace(
            meta_checkin_template_name="school_checkin_alert",
            meta_checkout_template_name="school_checkout_alert",
            meta_absent_template_name="school_absent_alert",
        ),
    )
    monkeypatch.setattr(whatsapp, "send_template_message", fake_send_template_message)

    await whatsapp.send_checkin_message(
        "phone-id",
        "token",
        "923001234567",
        "Parent",
        "Abdullah",
        "Demo School",
        "923001111111",
        "08:15 AM",
        "24 July 2026",
        "Class 5",
        "A",
    )
    await whatsapp.send_checkout_message(
        "phone-id",
        "token",
        "923001234567",
        "Parent",
        "Abdullah",
        "Demo School",
        "923001111111",
        "01:30 PM",
        "24 July 2026",
        "Class 5",
        "A",
    )
    await whatsapp.send_absent_message(
        "phone-id",
        "token",
        "923001234567",
        "Parent",
        "Demo School",
        "923001111111",
        "Abdullah",
        "24 July 2026",
        "Class 5",
        "A",
    )

    assert captured["school_checkin_alert"] == [
        "check-in",
        "Parent",
        "Abdullah",
        "08:15 AM",
        "24 July 2026",
        "Class 5-A",
        "Demo School",
    ]
    assert captured["school_checkout_alert"] == [
        "check-out",
        "Parent",
        "Abdullah",
        "01:30 PM",
        "24 July 2026",
        "Class 5-A",
        "Demo School",
    ]
    assert captured["school_absent_alert"] == [
        "absence",
        "Parent",
        "Abdullah",
        "24 July 2026",
        "Class 5-A",
        "Demo School",
    ]


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


def test_credential_encryption_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        credentials,
        "settings",
        type(
            "TestSettings",
            (),
            {
                "credential_encryption_key": Fernet.generate_key().decode("utf-8"),
                "app_env": "production",
            },
        )(),
    )

    encrypted = credentials.encrypt_credential("meta-secret-token")

    assert encrypted is not None
    assert encrypted.startswith(credentials.DEDICATED_KEY_PREFIX)
    assert encrypted != "meta-secret-token"
    assert credentials.decrypt_credential(encrypted) == "meta-secret-token"


def test_credential_encryption_can_use_domain_derived_biometric_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        credentials,
        "settings",
        type(
            "TestSettings",
            (),
            {
                "credential_encryption_key": None,
                "biometric_encryption_key": Fernet.generate_key().decode("utf-8"),
                "app_env": "production",
            },
        )(),
    )

    encrypted = credentials.encrypt_credential("meta-secret-token")

    assert encrypted is not None
    assert encrypted.startswith(credentials.DERIVED_KEY_PREFIX)
    assert credentials.decrypt_credential(encrypted) == "meta-secret-token"
