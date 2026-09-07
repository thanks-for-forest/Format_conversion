"""用户 ORM 模型（切片 5a：邮箱验证码登录）。"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


def _utcnow() -> datetime:
    """返回当前 UTC 时间（作列默认值）。"""
    return datetime.now(UTC)


class User(Base):
    """注册用户：邮箱即身份，无密码（验证码登录）。"""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
