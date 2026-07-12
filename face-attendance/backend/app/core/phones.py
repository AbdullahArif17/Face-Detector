def normalize_pakistan_phone(value: str) -> str:
    normalized = (
        value.strip()
        .replace(" ", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )
    if normalized.startswith("+"):
        normalized = normalized[1:]
    if normalized.startswith("03") and len(normalized) == 11:
        normalized = f"92{normalized[1:]}"
    if not (normalized.isdigit() and len(normalized) == 12 and normalized.startswith("92")):
        raise ValueError(
            "Phone must be Pakistan format, for example 923001234567 or 03001234567",
        )
    return normalized
