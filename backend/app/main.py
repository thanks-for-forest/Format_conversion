"""FastAPI 应用入口：路由挂载、CORS、统一响应信封。"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import archive, auth, convert, quota
from app.core import config
from app.core.responses import fail

# 应用日志可见（含开发假发送的验证码日志）
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)

app = FastAPI(title="Format Conversion API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(convert.router)
app.include_router(auth.router)
app.include_router(quota.router)
app.include_router(archive.router)


@app.get("/health")
def health() -> dict[str, str]:
    """健康检查，供部署探针使用。"""
    return {"status": "ok"}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """HTTP 异常统一转信封（不暴露堆栈/路径）。"""
    return JSONResponse(
        status_code=exc.status_code, content=fail(exc.status_code, str(exc.detail))
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """参数校验失败统一转信封。"""
    return JSONResponse(status_code=400, content=fail(400, "请求参数无效"))
