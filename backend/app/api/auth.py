"""认证路由：验证码发送/校验、JWT 会话、当前用户（切片 5a）。

会话：access(15min) + refresh(7d) 双 JWT，httpOnly + SameSite=Lax Cookie。
校验失败/未登录一律不暴露细节（防枚举）。
"""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Response
from pydantic import BaseModel, EmailStr, Field

from app.core import config, security
from app.core.database import get_session
from app.core.errors import ApiError
from app.core.responses import ok
from app.models.user import User
from app.services import code_store, mailer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SendCodeBody(BaseModel):
    """发码请求体。"""

    email: EmailStr


class VerifyBody(BaseModel):
    """验码请求体。"""

    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def _get_or_create_user(email: str) -> User:
    """按邮箱取用户，不存在则创建（验证码登录即注册）。"""
    with get_session() as session:
        user = session.query(User).filter(User.email == email).first()
        if user is None:
            user = User(id=uuid.uuid4().hex, email=email)
            session.add(user)
            session.commit()
        return user


def _issue_session(response: Response, user_id: str) -> None:
    """签发 access/refresh 双 Cookie。"""
    response.set_cookie(
        security.ACCESS_COOKIE,
        security.create_access_token(user_id),
        max_age=security.cookie_max_age(access=True),
        httponly=True,
        samesite="lax",
        secure=config.ENV == "production",
    )
    response.set_cookie(
        security.REFRESH_COOKIE,
        security.create_refresh_token(user_id),
        max_age=security.cookie_max_age(access=False),
        httponly=True,
        samesite="lax",
        secure=config.ENV == "production",
    )


def _current_user_id(access_token: str | None) -> str | None:
    """从 access Cookie 解析用户 ID，无效返回 None。"""
    if not access_token:
        return None
    return security.read_token(access_token, "access")


@router.post("/send-code")
def send_code(body: SendCodeBody, response: Response) -> dict[str, object]:
    """发送登录验证码（冷却期内拒绝，防轰炸）。"""
    if not code_store.send_allowed(body.email):
        raise ApiError(429, "发送过于频繁，请稍后再试")
    code = code_store.save_code(body.email)
    mailer.send_code_email(body.email, code)
    return ok({"sent": True})


@router.post("/verify")
def verify(body: VerifyBody, response: Response) -> dict[str, object]:
    """校验验证码并签发会话；验证码登录即注册。"""
    if not code_store.verify_code(body.email, body.code):
        raise ApiError(400, "验证码错误或已过期")
    user = _get_or_create_user(body.email)
    _issue_session(response, user.id)
    return ok({"user": {"id": user.id, "email": user.email}})


@router.post("/refresh")
def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, object]:
    """用 refresh 令牌轮换 access（滑动续期）。"""
    user_id = security.read_token(refresh_token or "", "refresh")
    if user_id is None:
        raise ApiError(401, "登录已过期")
    _issue_session(response, user_id)
    return ok({"refreshed": True})


@router.post("/logout")
def logout(response: Response) -> dict[str, object]:
    """退出：清除会话 Cookie。"""
    response.delete_cookie(security.ACCESS_COOKIE)
    response.delete_cookie(security.REFRESH_COOKIE)
    return ok({"logged_out": True})


@router.get("/me")
def me(
    access_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, object]:
    """当前登录用户；未登录 401。"""
    user_id = _current_user_id(access_token)
    if user_id is None:
        raise ApiError(401, "未登录")
    with get_session() as session:
        user = session.get(User, user_id)
        if user is None:
            raise ApiError(401, "未登录")
        return ok({"user": {"id": user.id, "email": user.email}})
