"""Celery 应用：broker 走 Redis；任务状态落 DB，不启用 result backend。"""

from celery import Celery

from app.core import config

celery_app = Celery(
    "format_conversion",
    broker=config.REDIS_URL,
    include=["app.workers.convert_task", "app.workers.sweep_task"],
)

celery_app.conf.update(
    task_always_eager=config.CELERY_TASK_ALWAYS_EAGER,
    task_eager_propagates=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    broker_connection_retry_on_startup=True,
    # beat 定时清扫（切片 7）：超时未下载文件与过期记录的兜底清理
    beat_schedule={
        "sweep-expired": {
            "task": "maintenance.sweep",
            "schedule": config.SWEEP_INTERVAL_MIN * 60.0,
        },
    },
)
