"""路由公共依赖：当前用户解析与客户端 IP 提取（切片 5b）。"""

from fastapi import Request

from app.core import security


def current_user_id(access_token: str | None) -> str | None:
    """从 access Cookie 解析用户 ID，无效返回 None。"""
    if not access_token:
        return None
    return security.read_token(access_token, "access")


def client_ip(request: Request) -> str:
    """客户端 IP：取 X-Forwarded-For 最后一跳。

    部署于自家反代（Caddy）后，反代会把真实客户端 IP 追加到 XFF 末尾；
    首段来自客户端请求头，可被任意伪造（审计 H1：取首段导致匿名配额
    可用伪造 XFF 无限刷新），因此必须取最后一跳。
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"
