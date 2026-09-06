"""应用配置：从环境变量读取，提供默认值。"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
TMP_DIR = Path(os.getenv("TMP_DIR", str(DATA_DIR / "tmp")))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

TMP_DIR.mkdir(parents=True, exist_ok=True)
