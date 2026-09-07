"""压缩包路由（切片 8）：打包 / 解压，同步处理、全程内存、不落盘。

轻 CPU + 内存中转，无需 Celery 异步任务；配额与转换同口径（计次 + 按上传
字节计流量）。响应直接为附件流（与任务下载端点一致，不走统一信封）。
"""

import logging
import urllib.parse
from typing import Annotated

from fastapi import APIRouter, Cookie, File, Request, UploadFile
from starlette.responses import Response

from app.api.deps import client_ip, current_user_id
from app.core.errors import ApiError
from app.core.responses import ok
from app.services import archive_service, quota

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/archive", tags=["archive"])


def _attachment(filename: str, data: bytes) -> Response:
    """ZIP 附件响应（文件名 RFC 5987 编码支持中文）。"""
    quoted = urllib.parse.quote(filename)
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quoted}",
            "Content-Length": str(len(data)),
        },
    )


@router.post("/pack")
def pack_files(
    request: Request,
    files: Annotated[list[UploadFile], File()],
    access_token: Annotated[str | None, Cookie()] = None,
) -> Response:
    """多文件打包为 ZIP（任意类型，含中文文件名）。"""
    user_id = current_user_id(access_token)
    limits = quota.limits_for(user_id)
    if not files:
        raise ApiError(400, "至少选择一个文件")
    entries: list[tuple[str, bytes]] = []
    total = 0
    for f in files:
        data = f.file.read()
        total += len(data)
        if total > limits.max_upload_bytes:
            max_mb = limits.max_upload_bytes // (1024 * 1024)
            raise ApiError(413, f"文件总大小超过上限（{max_mb}MB）")
        entries.append((f.filename or "file", data))
    quota.consume(user_id, client_ip(request), total)
    logger.info("打包: files=%d total=%d", len(entries), total)
    return _attachment("archive.zip", archive_service.pack(entries))


@router.post("/extract")
def extract_archive(
    request: Request,
    file: Annotated[UploadFile, File()],
    access_token: Annotated[str | None, Cookie()] = None,
) -> Response:
    """ZIP / TAR.GZ 解压，统一重打包为 ZIP 交付。"""
    user_id = current_user_id(access_token)
    limits = quota.limits_for(user_id)
    data = file.file.read()
    if len(data) > limits.max_upload_bytes:
        max_mb = limits.max_upload_bytes // (1024 * 1024)
        raise ApiError(413, f"文件超过大小上限（{max_mb}MB）")
    if not (archive_service.is_zip(data[:4]) or archive_service.is_gzip(data[:2])):
        raise ApiError(415, "仅支持 zip / tar.gz 压缩包")
    quota.consume(user_id, client_ip(request), len(data))
    stem = (file.filename or "archive").rsplit(".", 1)[0] or "archive"
    result = archive_service.extract(data)
    logger.info("解压: name=%s in=%d out=%d", file.filename, len(data), len(result))
    return _attachment(f"{stem}.zip", result)


@router.get("/limits")
def archive_limits() -> dict[str, object]:
    """压缩包能力说明（前端提示用）。"""
    return ok(
        {
            "pack": True,
            "extract_inputs": ["zip", "tar.gz"],
            "extract_output": "zip",
        }
    )
