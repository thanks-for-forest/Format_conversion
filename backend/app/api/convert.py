"""转换相关路由：上传转换、任务查询、结果下载。

切片 1：同步转换，仅 PNG → JPG；匿名任务用 pass_key 防遍历。
切片 3a：任务状态经 SQLite 落库，对外 API 契约不变。
切片 3b：投递 Celery 异步任务。
切片 4a：表驱动多格式互转（五进三出），扩展名 + 魔数双重校验。
"""

import hmac
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from starlette.background import BackgroundTask
from starlette.responses import FileResponse

from app.core import config
from app.core.errors import ApiError
from app.core.formats import (
    HEAD_LEN,
    INPUT_FORMATS,
    OUTPUT_FORMATS,
    ImageFormat,
    ext_of_filename,
    media_type_of,
    normalize_ext,
)
from app.core.responses import ok
from app.models.task import ConversionTask
from app.services.task_store import STORE
from app.workers.convert_task import run_conversion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["convert"])

CHUNK_SIZE = 1024 * 1024


def _validate_request(file: UploadFile, target: str) -> ImageFormat:
    """请求参数与文件名预检：目标格式白名单 + 源扩展名白名单。"""
    target_ext = normalize_ext(target)
    if target_ext not in OUTPUT_FORMATS:
        raise ApiError(400, "仅支持输出 png / jpg / webp")
    source = INPUT_FORMATS.get(ext_of_filename(file.filename or ""))
    if source is None:
        raise ApiError(415, "仅支持 png / jpg / webp / bmp / gif（扩展名）")
    return source


def _save_upload(file: UploadFile, task_id: str, source: ImageFormat) -> int:
    """魔数校验 + 流式落盘（限额内分块写入，超限即拒绝）。"""
    file.file.seek(0)
    head = file.file.read(HEAD_LEN)
    if not source.matches(head):
        raise ApiError(415, "文件内容与扩展名不符（魔数校验失败）")
    path = config.TMP_DIR / f"{task_id}.{source.ext}"
    size = len(head)
    try:
        with path.open("wb") as out:
            out.write(head)
            while chunk := file.file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > config.MAX_UPLOAD_BYTES:
                    raise ApiError(413, "文件超过大小上限")
                out.write(chunk)
    except ApiError:
        path.unlink(missing_ok=True)
        raise
    return size


def _cleanup_task_files(task_id: str) -> None:
    """下载完成后删除临时文件（处理完即删）。"""
    task = STORE.get(task_id)
    if task is None:
        return
    task.in_path.unlink(missing_ok=True)
    task.out_path.unlink(missing_ok=True)
    STORE.mark_files_removed(task_id)


def _load_task(task_id: str, pass_key: str) -> ConversionTask:
    """按 id + pass_key 取任务；不匹配一律 404，防枚举。"""
    task = STORE.get(task_id)
    if task is None or not hmac.compare_digest(task.pass_key, pass_key or ""):
        raise ApiError(404, "任务不存在或已过期")
    return task


@router.post("/convert")
def create_conversion(
    file: Annotated[UploadFile, File()], target: Annotated[str, Form()] = "jpg"
) -> dict[str, object]:
    """上传图片后异步转换，立即返回任务凭证（queued）。"""
    source = _validate_request(file, target)
    target_ext = normalize_ext(target)
    task = STORE.create(
        source_name=file.filename or f"upload.{source.ext}",
        source_format=source.ext,
        target_format=target_ext,
    )
    in_size = _save_upload(file, task.id, source)
    STORE.set_in_size(task.id, in_size)
    STORE.mark_queued(task.id)
    try:
        run_conversion.delay(task.id)
    except Exception as exc:  # noqa: BLE001 broker 不可用等投递失败
        logger.exception("任务投递失败: task_id=%s", task.id)
        STORE.mark_failed(task.id, "系统繁忙，请稍后重试")
        raise ApiError(503, "系统繁忙，请稍后重试") from exc
    return ok(
        {
            "task_id": task.id,
            "pass_key": task.pass_key,
            "status": "queued",
            "in_size": in_size,
        }
    )


@router.get("/tasks/{task_id}")
def get_task(task_id: str, pass_key: str = "") -> dict[str, object]:
    """查询任务状态（需 pass_key）。"""
    task = _load_task(task_id, pass_key)
    return ok(task.public())


@router.get("/tasks/{task_id}/download")
def download_task(task_id: str, pass_key: str = "") -> FileResponse:
    """下载转换结果，下载即删；文件已清理则 404。"""
    task = _load_task(task_id, pass_key)
    if task.status != "succeeded" or task.files_removed:
        raise ApiError(404, "结果文件不存在或已清理")
    stem = Path(task.source_name).stem
    return FileResponse(
        path=task.out_path,
        media_type=media_type_of(task.target_format),
        filename=f"{stem}.{task.target_format}",
        background=BackgroundTask(_cleanup_task_files, task.id),
    )
