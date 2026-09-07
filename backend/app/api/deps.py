"""路由公共依赖：当前用户解析与客户端 IP 提取（切片 5b）。"""

from fastapi import Request

from app.core import security


def current_user_id(access_token: str | None) -> str | None:
    """从 access Cookie 解析用户 ID，无效返回 None。"""
    if not access_token:
        return None
    return security.read_token(access_token, "access")


def client_ip(request: Request) -> str:
    """客户端 IP：优先 X-Forwarded-For 首段（部署于反向代理后）。"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"
