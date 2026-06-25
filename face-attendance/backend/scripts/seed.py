"""Backward-compatible wrapper for the canonical application seed."""

from app.seed import seed


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed())
