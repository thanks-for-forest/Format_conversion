"""应用配置：从环境变量读取，提供默认值；自动加载项目根目录 .env。"""

import logging
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
# IP 级发码小时限流（审计 M1）：防换邮箱刷码耗尽 SMTP 配额
SEND_IP_HOURLY_LIMIT = int(os.getenv("SEND_IP_HOURLY_LIMIT", "10"))
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@example.com")

# ===== 内容安全审核（切片 10d 骨架） =====
# 两变量均配置 = 启用（fail-closed）；KEY 为空 = 未启用（跳过 + 启动 WARNING）
MODERATION_API_KEY = os.getenv("MODERATION_API_KEY", "")
MODERATION_API_URL = os.getenv("MODERATION_API_URL", "")

# ===== 配额（切片 5b，口径见 PRD 3.4） =====
# 匿名：单文件 ≤50MB、5 次/天、100MB 流量/天；登录：≤200MB、50 次/天、2GB/天
_MB = 1024 * 1024
MAX_UPLOAD_BYTES_USER = int(os.getenv("MAX_UPLOAD_BYTES_USER", str(200 * _MB)))
ANON_DAILY_COUNT = int(os.getenv("ANON_DAILY_COUNT", "5"))
ANON_DAILY_TRAFFIC_BYTES = int(os.getenv("ANON_DAILY_TRAFFIC_BYTES", str(100 * _MB)))
USER_DAILY_COUNT = int(os.getenv("USER_DAILY_COUNT", "50"))
USER_DAILY_TRAFFIC_BYTES = int(os.getenv("USER_DAILY_TRAFFIC_BYTES", str(2048 * _MB)))

# ===== 清扫（切片 7，Celery beat 定时执行） =====
SWEEP_INTERVAL_MIN = int(os.getenv("SWEEP_INTERVAL_MIN", "10"))
SWEEP_FILE_RETENTION_MIN = int(os.getenv("SWEEP_FILE_RETENTION_MIN", "60"))
SWEEP_STUCK_AFTER_MIN = int(os.getenv("SWEEP_STUCK_AFTER_MIN", "120"))
SWEEP_ROW_RETENTION_DAYS = int(os.getenv("SWEEP_ROW_RETENTION_DAYS", "7"))

# ===== 文档转换（切片 10a：LibreOffice 服务端） =====
SOFFICE_PATH = os.getenv("SOFFICE_PATH", "")  # 留空自动探测 PATH 与常见安装位置
SOFFICE_TIMEOUT_SEC = int(os.getenv("SOFFICE_TIMEOUT_SEC", "120"))

# ===== 音视频转换（切片 10b/10e：ffmpeg 服务端） =====
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "")  # 留空自动探测 PATH 与常见安装位置
FFMPEG_TIMEOUT_SEC = int(os.getenv("FFMPEG_TIMEOUT_SEC", "300"))
# 视频转码 CPU 重，独立超时（提取音轨走 FFMPEG_TIMEOUT_SEC）
VIDEO_FFMPEG_TIMEOUT_SEC = int(os.getenv("VIDEO_FFMPEG_TIMEOUT_SEC", "900"))

TMP_DIR.mkdir(parents=True, exist_ok=True)

# 生产环境兜底（审计 L1）：弱默认密钥直接拒绝启动，防止公开默认值伪造 JWT
if ENV == "production" and SECRET_KEY == "dev-insecure-secret-change-me":
    raise RuntimeError("生产环境必须通过环境变量设置强 SECRET_KEY")

# 内容审核（切片 10d）：未配置 = 未启用，显式提示避免误以为已有审核能力
if not MODERATION_API_KEY:
    logging.getLogger(__name__).warning(
        "MODERATION_API_KEY 未配置：内容审核未启用（PRD 3.6），上线前请评估接入"
    )
