"""统一响应信封：{ code, data, message }。"""

from typing import Any


def ok(data: Any) -> dict[str, Any]:
    """成功响应信封。"""
    return {"code": 0, "data": data, "message": "ok"}


def fail(code: int, message: str) -> dict[str, Any]:
    """失败响应信封。"""
    return {"code": code, "data": None, "message": message}
