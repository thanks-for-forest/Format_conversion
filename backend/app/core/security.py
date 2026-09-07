"""安全工具：JWT 签发/校验与 Cookie 策略（切片 5a）。"""

from datetime import UTC, datetime, timedelta

import jwt

from app.core import config

ALGORITHM = "HS256"
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _expire(seconds: int) -> datetime:
    """计算 JWT 过期时间。"""
    return datetime.now(UTC) + timedelta(seconds=seconds)


def create_access_token(user_id: str) -> str:
    """签发短时访问令牌（默认 15 分钟）。"""
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": _expire(config.JWT_ACCESS_TTL_MIN * 60),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """签发长时刷新令牌（默认 7 天）。"""
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": _expire(config.JWT_REFRESH_TTL_DAYS * 86400),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=ALGORITHM)


def read_token(token: str, expected_type: str) -> str | None:
    """校验 JWT 并返回 user_id；无效/类型不符/过期返回 None。"""
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


def cookie_max_age(access: bool) -> int:
    """Cookie 有效期（秒），与对应 JWT TTL 一致。"""
    return (
        config.JWT_ACCESS_TTL_MIN * 60
        if access
        else config.JWT_REFRESH_TTL_DAYS * 86400
    )
