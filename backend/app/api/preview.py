"""Office 内容预览（切片 11a）：服务端 soffice 转 PDF 回传，即转即删。

与 /api/convert 的差异：
- 同步返回 PDF 流（预览要即时可见，不走 Celery 队列、不落任务库）；
- 不计转换配额、不接内容审核——结果仅回传上传者本人，无 UGC 传播面，
  文档安全由魔数校验 + soffice 宏禁用 profile（doc_service）兜底；
- 仅收 9 种二进制 Office——文本类（txt/csv/html/md）前端已原生渲染预览；
- 防滥用：Redis 每日每 IP 计数（soffice 转换有 CPU 成本），Redis 异常放行。
"""

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, File, Request, UploadFile
from starlette.background import BackgroundTask
from starlette.responses import FileResponse

from app.api.deps import client_ip, current_user_id
from app.core import config
from app.core.doc_formats import DOC_HEAD_LEN, DOC_INPUT_FORMATS
from app.core.errors import ApiError
from app.services import doc_service
from app.services.quota import limits_for
from app.services.redis_client import get_client

router = APIRouter(prefix="/api/preview", tags=["preview"])

CHUNK_SIZE = 1024 * 1024

# 可预览的 Office 二进制格式（文本类前端原生渲染，不经服务端）
_OFFICE_EXTS = frozenset(
    ("doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp")
)


def _check_rate(ip: str) -> None:
    """每日每 IP 预览计数，超限 429；Redis 异常时放行（预览为低风险功能）。"""
    try:
        client = get_client()
        key = f"fc:pv:{datetime.now(UTC):%Y%m%d}:{ip}"
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 86_400)
        count = pipe.execute()[0]
        if int(count) > config.PREVIEW_DAILY_COUNT:
            raise ApiError(429, "今日预览次数已达上限，请明日再试")
    except ApiError:
        raise
    except Exception:  # noqa: BLE001 Redis 不可用不阻断预览
        pass


def _save_upload(file: UploadFile, path: Path, head: bytes, limit: int) -> None:
    """流式落盘（限额内分块写入，超限即删即拒）。"""
    size = len(head)
    try:
        with path.open("wb") as out:
            out.write(head)
            while chunk := file.file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > limit:
                    raise ApiError(413, "文件超过大小上限")
                out.write(chunk)
    except ApiError:
        path.unlink(missing_ok=True)
        raise


@router.post("/office")
def preview_office(
    request: Request,
    file: Annotated[UploadFile, File()],
    access_token: Annotated[str | None, Cookie()] = None,
) -> FileResponse:
    """Office 文档转 PDF 并流式回传（同步，首次生成约数秒）。"""
    limits = limits_for(current_user_id(access_token))
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _OFFICE_EXTS:
        raise ApiError(415, "该类型暂不支持内容预览（仅支持 Office 文档）")
    file.file.seek(0, 2)
    if file.file.tell() > limits.max_upload_bytes:
        max_mb = limits.max_upload_bytes // (1024 * 1024)
        raise ApiError(413, f"文件超过大小上限（{max_mb}MB）")
    file.file.seek(0)
    head = file.file.read(DOC_HEAD_LEN)
    if not DOC_INPUT_FORMATS[ext].matches(head):
        raise ApiError(415, "文件内容与扩展名不符")
    _check_rate(client_ip(request))

    pid = uuid.uuid4().hex  # 文件名由服务端派生，不接触用户原始文件名
    in_path = config.TMP_DIR / f"pv-{pid}.{ext}"
    out_path = config.TMP_DIR / f"pv-{pid}.pdf"
    _save_upload(file, in_path, head, limits.max_upload_bytes)
    try:
        doc_service.convert_document(in_path, out_path, "pdf")
    except ApiError:
        in_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)
        raise

    stem = filename.rsplit(".", 1)[0]

    def _cleanup() -> None:
        in_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)

    return FileResponse(
        path=out_path,
        media_type="application/pdf",
        filename=f"{stem}.pdf",
        background=BackgroundTask(_cleanup),
    )
