import asyncio

from sqlalchemy import select

from app.core.config import settings
from app.core.credentials import encrypt_credential, is_encrypted_credential
from app.core.database import SessionLocal, engine
from app.models.company import Company


async def encrypt_legacy_company_credentials() -> int:
    if not settings.credential_encryption_key and not settings.biometric_encryption_key:
        raise RuntimeError(
            "Set CREDENTIAL_ENCRYPTION_KEY or BIOMETRIC_ENCRYPTION_KEY before running this command",
        )

    converted = 0
    async with SessionLocal() as session:
        companies = list(
            await session.scalars(
                select(Company).where(Company.whatsapp_token.is_not(None)),
            ),
        )
        for company in companies:
            token = company.whatsapp_token
            if not token or is_encrypted_credential(token):
                continue
            company.whatsapp_token = encrypt_credential(token)
            converted += 1
        await session.commit()
    return converted


async def main() -> None:
    converted = await encrypt_legacy_company_credentials()
    await engine.dispose()
    print(f"Encrypted {converted} company credential(s).")


if __name__ == "__main__":
    asyncio.run(main())
