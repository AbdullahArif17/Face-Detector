import pytest
from fastapi import HTTPException
from starlette.responses import Response

from app.core.config import settings
from app.routers.platform_admin import (
    create_platform_token,
    require_platform_admin,
    set_platform_cookie,
    clear_platform_cookie,
)
from app.schemas.platform_admin import (
    PlatformLoginRequest,
    OrgStatusUpdate,
    OrgUpdate,
)
from pydantic import ValidationError


def test_create_platform_token() -> None:
    token = create_platform_token()
    assert isinstance(token, str)
    assert len(token) > 20


@pytest.mark.asyncio
async def test_require_platform_admin_with_direct_key() -> None:
    expected = settings.platform_admin_key
    assert expected is not None
    # Valid key
    is_admin = await require_platform_admin(direct_key=expected)
    assert is_admin is True

    # Invalid key
    with pytest.raises(HTTPException) as exc_info:
        await require_platform_admin(direct_key="wrong-key")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_require_platform_admin_with_bearer_token() -> None:
    token = create_platform_token()
    is_admin = await require_platform_admin(authorization=f"Bearer {token}")
    assert is_admin is True

    with pytest.raises(HTTPException) as exc_info:
        await require_platform_admin(authorization="Bearer invalid.token.here")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_require_platform_admin_with_cookie() -> None:
    token = create_platform_token()
    is_admin = await require_platform_admin(platform_cookie=token)
    assert is_admin is True

    with pytest.raises(HTTPException) as exc_info:
        await require_platform_admin(platform_cookie="fake-cookie")
    assert exc_info.value.status_code == 401


def test_platform_cookie_handlers() -> None:
    token = create_platform_token()
    response = Response()
    set_platform_cookie(response, token)
    # Check Set-Cookie was added
    cookie_headers = response.headers.getlist("set-cookie")
    assert any("face_attendance_platform_session" in c for c in cookie_headers)

    clear_response = Response()
    clear_platform_cookie(clear_response)
    cookie_headers = clear_response.headers.getlist("set-cookie")
    assert any("face_attendance_platform_session" in c for c in cookie_headers)


def test_org_status_update_schema() -> None:
    valid_active = OrgStatusUpdate(status="active")
    assert valid_active.status == "active"

    valid_suspended = OrgStatusUpdate(status="suspended")
    assert valid_suspended.status == "suspended"

    with pytest.raises(ValidationError):
        OrgStatusUpdate(status="deleted")


def test_org_update_schema() -> None:
    update = OrgUpdate(name="New Name", package="pro", employee_limit=100)
    assert update.name == "New Name"
    assert update.package == "pro"
    assert update.employee_limit == 100
