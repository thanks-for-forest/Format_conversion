"""Celery 定时清扫任务（beat 调度，切片 7）。"""

from celery.utils.log import get_task_logger

from app.services import sweeper
from app.workers.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="maintenance.sweep")
def sweep_expired() -> dict[str, int]:
    """清扫过期文件与记录，返回统计。"""
    stats = sweeper.sweep()
    logger.info("清扫完成: %s", stats)
    return stats
