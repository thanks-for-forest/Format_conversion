"""Celery 转换任务（切片 3b：替换进程内线程 worker；切片 10a/10b：按目标格式路由）。"""

from celery.utils.log import get_task_logger

from app.core.audio_formats import AUDIO_OUTPUT_FORMATS
from app.core.doc_formats import DOC_OUTPUT_FORMATS
from app.core.errors import ApiError
from app.services import audio_service, convert_service, doc_service
from app.services.task_store import STORE
from app.workers.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="conversion.run")
def run_conversion(task_id: str) -> None:
    """执行单个转换任务：running → 转换 → succeeded/failed。"""
    task = STORE.get(task_id)
    if task is None:
        logger.warning("任务不存在: task_id=%s", task_id)
        return
    STORE.mark_running(task_id)
    try:
        if task.target_format in DOC_OUTPUT_FORMATS:
            doc_service.convert_document(
                task.in_path, task.out_path, task.target_format
            )
        elif task.target_format in AUDIO_OUTPUT_FORMATS:
            audio_service.convert_audio(task.in_path, task.out_path, task.target_format)
        else:
            convert_service.convert_image(
                task.in_path, task.out_path, task.target_format
            )
    except ApiError as exc:
        task.in_path.unlink(missing_ok=True)
        detail = exc.detail if isinstance(exc.detail, str) else "转换失败"
        STORE.mark_failed(task_id, detail)
        logger.error("转换失败: task_id=%s error=%s", task_id, detail)
        return
    STORE.mark_succeeded(task_id, task.out_path.stat().st_size)
    logger.info("转换成功: task_id=%s", task_id)
