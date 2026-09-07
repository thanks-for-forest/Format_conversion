"""应用配置：从环境变量读取，提供默认值；自动加载项目根目录 .env。"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR.parent / ".env")  # 与根目录 .env.example 同位置，不进仓库

DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
TMP_DIR = Path(os.getenv("TMP_DIR", str(DATA_DIR / "tmp")))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# 测试环境置 1：Celery 任务同步执行，无需真实 Redis broker
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "0") == "1"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

# ===== 认证（切片 5a） =====
ENV = os.getenv("ENV", "development")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me")
JWT_ACCESS_TTL_MIN = int(os.getenv("JWT_ACCESS_TTL_MIN", "15"))
JWT_REFRESH_TTL_DAYS = int(os.getenv("JWT_REFRESH_TTL_DAYS", "7"))
CODE_TTL_SEC = int(os.getenv("CODE_TTL_SEC", "300"))
CODE_SEND_COOLDOWN_SEC = int(os.getenv("CODE_SEND_COOLDOWN_SEC", "60"))
CODE_MAX_ATTEMPTS = int(os.getenv("CODE_MAX_ATTEMPTS", "5"))
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@example.com")

TMP_DIR.mkdir(parents=True, exist_ok=True)
