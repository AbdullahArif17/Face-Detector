import base64
from datetime import date

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.core import biometrics
from app.core.images import MAX_IMAGE_BYTES, normalize_base64_image
from app.core.time import local_day_bounds, to_local
from app.routers.attendance import csv_safe, get_check_in_status


def test_local_day_bounds_use_pakistan_timezone() -> None:
    start, end = local_day_bounds(date(2026, 7, 11))

    assert start.isoformat() == "2026-07-10T19:00:00+00:00"
    assert end.isoformat() == "2026-07-11T19:00:00+00:00"
    assert to_local(start).date() == date(2026, 7, 11)


def test_late_status_uses_local_school_time() -> None:
    start, _ = local_day_bounds(date(2026, 7, 11))

    assert get_check_in_status(start.replace(hour=3, minute=59)) == "present"
    assert get_check_in_status(start.replace(hour=4, minute=16)) == "late"


def test_image_normalization_rejects_oversized_payload() -> None:
    oversized = base64.b64encode(b"x" * (MAX_IMAGE_BYTES + 1)).decode("ascii")

    with pytest.raises(HTTPException) as error:
        normalize_base64_image(oversized)

    assert error.value.status_code == 413


def test_csv_safe_blocks_spreadsheet_formula_prefixes() -> None:
    assert csv_safe("=HYPERLINK('https://example.com')").startswith("'")
    assert csv_safe("Student Name") == "Student Name"


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
