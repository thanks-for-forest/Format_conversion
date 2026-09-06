"""Celery 应用：broker 走 Redis；任务状态落 DB，不启用 result backend。"""

from celery import Celery

from app.core import config

celery_app = Celery(
    "format_conversion",
    broker=config.REDIS_URL,
    include=["app.workers.convert_task"],
)

celery_app.conf.update(
    task_always_eager=config.CELERY_TASK_ALWAYS_EAGER,
    task_eager_propagates=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    broker_connection_retry_on_startup=True,
)
