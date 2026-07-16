import hashlib
import hmac
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import webhooks


def test_meta_signature_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        webhooks,
        "settings",
        SimpleNamespace(meta_app_secret="app-secret", app_env="production"),
    )
    body = b'{"object":"whatsapp_business_account"}'
    signature = "sha256=" + hmac.new(b"app-secret", body, hashlib.sha256).hexdigest()

    webhooks.verify_meta_signature(body, signature)

    with pytest.raises(HTTPException) as error:
        webhooks.verify_meta_signature(body, "sha256=invalid")
    assert error.value.status_code == 401


def test_extracts_inbound_text_message() -> None:
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": "12345"},
                            "messages": [
                                {
                                    "id": "wamid.test",
                                    "from": "923001234567",
                                    "type": "text",
                                    "text": {"body": " status "},
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    }

    assert webhooks.iter_inbound_text_messages(payload) == [
        {
            "message_id": "wamid.test",
            "sender": "923001234567",
            "body": "status",
            "phone_number_id": "12345",
        },
    ]


@pytest.mark.asyncio
async def test_urdu_attendance_command_uses_status_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_attendance_reply(_session: object, _students: object) -> str:
        return "attendance reply"

    monkeypatch.setattr(webhooks, "build_attendance_reply", fake_attendance_reply)

    reply = await webhooks.build_chatbot_reply(
        SimpleNamespace(),
        message_body="حاضری",
        students=[],
    )

    assert reply == "attendance reply"


def test_shared_parent_number_does_not_cross_tenants() -> None:
    students = [SimpleNamespace(school_id=1), SimpleNamespace(school_id=2)]

    assert webhooks.unambiguous_school_id(students) is None  # type: ignore[arg-type]
