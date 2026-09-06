"""API 业务错误定义。"""

from fastapi import HTTPException


class ApiError(HTTPException):
    """业务错误：携带统一信封 code（=HTTP 状态码）。"""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(status_code=status_code, detail=message)
