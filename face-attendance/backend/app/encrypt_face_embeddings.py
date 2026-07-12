import asyncio

from sqlalchemy import select

from app.core.biometrics import prepare_embedding_storage
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models.face_embedding import FaceEmbedding


async def encrypt_legacy_embeddings() -> int:
    if not settings.biometric_encryption_key:
        raise RuntimeError("Set BIOMETRIC_ENCRYPTION_KEY before running this command")

    converted = 0
    async with SessionLocal() as session:
        embeddings = list(
            (
                await session.execute(
                    select(FaceEmbedding).where(
                        FaceEmbedding.embedding_ciphertext.is_(None),
                        FaceEmbedding.embedding_vector.is_not(None),
                    ),
                )
            )
            .scalars()
            .all(),
        )
        for embedding in embeddings:
            if embedding.embedding_vector is None:
                continue
            ciphertext, legacy_vector = prepare_embedding_storage(
                [float(value) for value in embedding.embedding_vector],
            )
            embedding.embedding_ciphertext = ciphertext
            embedding.embedding_vector = legacy_vector
            converted += 1
        await session.commit()
    return converted


async def main() -> None:
    converted = await encrypt_legacy_embeddings()
    await engine.dispose()
    print(f"Encrypted {converted} legacy face embedding(s).")


if __name__ == "__main__":
    asyncio.run(main())
