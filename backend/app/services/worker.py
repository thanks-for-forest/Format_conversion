"""进程内后台转换执行器（切片2：线程消费队列，替代 Celery/Redis）。

与 Web 服务同进程，共享同一个 STORE，因此无需跨进程同步任务状态。
切片3 迁移 SQLite + Celery 后，本模块将被替换。
"""

from __future__ import annotations

import queue
import threading

from app.core.errors import ApiError
from app.services import convert_service
from app.services.task_store import STORE, Task

WORKER_COUNT = 4

_queue: queue.Queue[Task] = queue.Queue()


def submit(task: Task) -> None:
    """任务入队，进入 queued 状态。"""
    STORE.mark_queued(task)
    _queue.put(task)


def _run(task: Task) -> None:
    """执行单个任务：状态流转 + 转换。"""
    if task.in_path is None or task.out_path is None:
        STORE.mark_failed(task, "任务缺少文件路径")
        return
    STORE.mark_running(task)
    try:
        convert_service.png_to_jpg(task.in_path, task.out_path)
    except ApiError as exc:
        task.in_path.unlink(missing_ok=True)
        detail = exc.detail if isinstance(exc.detail, str) else "转换失败"
        STORE.mark_failed(task, detail)
        return
    STORE.mark_succeeded(task, task.out_path.stat().st_size)


def _consume() -> None:
    """消费循环（阻塞，由后台线程运行）。"""
    while True:
        task = _queue.get()
        try:
            _run(task)
        finally:
            _queue.task_done()


for _i in range(WORKER_COUNT):
    threading.Thread(target=_consume, daemon=True, name=f"convert-{_i}").start()
