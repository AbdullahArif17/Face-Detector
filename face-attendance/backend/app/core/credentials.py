from base64 import urlsafe_b64encode

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings


DEDICATED_KEY_PREFIX = "enc:v1:"
DERIVED_KEY_PREFIX = "enc:v1d:"
ENCRYPTED_PREFIXES = (DEDICATED_KEY_PREFIX, DERIVED_KEY_PREFIX)


class CredentialConfigurationError(RuntimeError):
    pass


def _fernet(*, derived: bool) -> Fernet | None:
    key = settings.biometric_encryption_key if derived else settings.credential_encryption_key
    if not key:
        return None
    try:
        if derived:
            derived_key = HKDF(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b"face-attendance-credential-encryption",
                info=b"v1",
            ).derive(key.encode("utf-8"))
            return Fernet(urlsafe_b64encode(derived_key))
        return Fernet(key.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise CredentialConfigurationError(
            "CREDENTIAL_ENCRYPTION_KEY must be a valid Fernet key",
        ) from exc


def is_encrypted_credential(value: str | None) -> bool:
    return bool(value and value.startswith(ENCRYPTED_PREFIXES))


def encrypt_credential(value: str | None) -> str | None:
    if value is None or is_encrypted_credential(value):
        return value
    use_derived_key = not bool(settings.credential_encryption_key)
    cipher = _fernet(derived=use_derived_key)
    if cipher is None:
        if settings.app_env.lower() == "production":
            raise CredentialConfigurationError(
                "CREDENTIAL_ENCRYPTION_KEY or BIOMETRIC_ENCRYPTION_KEY is required in production",
            )
        return value
    encrypted = cipher.encrypt(value.encode("utf-8")).decode("utf-8")
    prefix = DERIVED_KEY_PREFIX if use_derived_key else DEDICATED_KEY_PREFIX
    return f"{prefix}{encrypted}"


def decrypt_credential(value: str | None) -> str | None:
    if value is None or not is_encrypted_credential(value):
        return value
    use_derived_key = value.startswith(DERIVED_KEY_PREFIX)
    cipher = _fernet(derived=use_derived_key)
    if cipher is None:
        raise CredentialConfigurationError(
            "CREDENTIAL_ENCRYPTION_KEY is required to read stored credentials",
        )
    prefix = DERIVED_KEY_PREFIX if use_derived_key else DEDICATED_KEY_PREFIX
    token = value.removeprefix(prefix)
    try:
        return cipher.decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, TypeError, ValueError, UnicodeDecodeError) as exc:
        raise CredentialConfigurationError(
            "Stored credential could not be decrypted",
        ) from exc
