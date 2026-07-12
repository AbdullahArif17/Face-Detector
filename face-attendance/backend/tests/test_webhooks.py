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
