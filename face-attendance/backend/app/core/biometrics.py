import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class BiometricConfigurationError(RuntimeError):
    pass


def _fernet() -> Fernet | None:
    key = settings.biometric_encryption_key
    if not key:
        return None
    try:
        return Fernet(key.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise BiometricConfigurationError(
            "BIOMETRIC_ENCRYPTION_KEY must be a valid Fernet key",
        ) from exc


def prepare_embedding_storage(
    vector: list[float],
) -> tuple[str | None, list[float] | None]:
    cipher = _fernet()
    if cipher is None:
        if settings.app_env.lower() == "production":
            raise BiometricConfigurationError(
                "BIOMETRIC_ENCRYPTION_KEY is required in production",
            )
        return None, vector

    payload = json.dumps(vector, separators=(",", ":")).encode("utf-8")
    return cipher.encrypt(payload).decode("utf-8"), None


def read_embedding(
    *,
    ciphertext: str | None,
    legacy_vector: Any,
) -> list[float]:
    if ciphertext:
        cipher = _fernet()
        if cipher is None:
            raise BiometricConfigurationError(
                "BIOMETRIC_ENCRYPTION_KEY is required to read face embeddings",
            )
        try:
            decoded = json.loads(cipher.decrypt(ciphertext.encode("utf-8")))
        except (InvalidToken, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise BiometricConfigurationError(
                "Stored face embedding could not be decrypted",
            ) from exc
        if not isinstance(decoded, list):
            raise BiometricConfigurationError("Stored face embedding is invalid")
        return [float(value) for value in decoded]

    if isinstance(legacy_vector, list):
        return [float(value) for value in legacy_vector]
    raise BiometricConfigurationError("Stored face embedding is missing")
