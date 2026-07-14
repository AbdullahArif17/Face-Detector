import base64

import numpy as np
import pytest
from fastapi import HTTPException

from main import (
    EmbeddingCandidate,
    EnrollRequest,
    aggregate_embeddings,
    find_best_match,
)
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


def test_enrollment_request_accepts_multiple_images() -> None:
    request = EnrollRequest(student_id=1, images=["first", "second"])

    assert request.resolved_images() == ["first", "second"]


def test_enrollment_centroid_improves_sample_similarity() -> None:
    first = [1.0, 0.0]
    second = [0.8, 0.6]

    centroid = np.asarray(aggregate_embeddings([first, second]))

    assert float(np.dot(centroid, np.asarray(first))) > 0.94
    assert float(np.dot(centroid, np.asarray(second))) > 0.94


def test_enrollment_rejects_different_people() -> None:
    with pytest.raises(HTTPException) as error:
        aggregate_embeddings([[1.0, 0.0], [0.0, 1.0]])

    assert "same person" in str(error.value.detail)
