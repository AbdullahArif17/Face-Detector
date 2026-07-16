import sys
from types import ModuleType


# Unit tests exercise matching and validation logic without downloading the
# multi-gigabyte TensorFlow/DeepFace runtime. The release Docker image still
# installs and smoke-tests the real production dependency set.
deepface_stub = ModuleType("deepface")
deepface_stub.DeepFace = object  # type: ignore[attr-defined]
sys.modules.setdefault("deepface", deepface_stub)
