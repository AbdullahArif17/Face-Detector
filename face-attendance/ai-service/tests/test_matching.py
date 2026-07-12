import base64

import numpy as np
import pytest
from fastapi import HTTPException

from main import EmbeddingCandidate, find_best_match
from utils import base64_to_image


def test_best_match_and_margin() -> None:
    match = find_best_match(
        [1.0, 0.0],
        [
            EmbeddingCandidate(student_id=1, vector=[1.0, 0.0]),
            EmbeddingCandidate(student_id=2, vector=[0.0, 1.0]),
        ],
    )

    assert match.employee_id == "1"
    assert match.score == pytest.approx(1.0)
    assert match.margin == pytest.approx(1.0)


def test_base64_decoder_rejects_oversized_image() -> None:
    encoded = base64.b64encode(np.zeros(101, dtype=np.uint8).tobytes()).decode("ascii")

    with pytest.raises(HTTPException) as error:
        base64_to_image(encoded, max_bytes=100)

    assert error.value.status_code == 413
