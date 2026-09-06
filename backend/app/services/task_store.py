"""内存任务存储（切片 1 临时实现，后续迁移 SQLite + Celery）。"""

import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Task:
    """一次转换任务。"""

    id: str
    pass_key: str
    status: str  # pending | queued | running | succeeded | failed
    message: str
    source_name: str
    target_ext: str
    in_size: int
    out_size: int | None
    created_at: float
    finished_at: float | None = None
    files_removed: bool = False
    in_path: Path | None = field(default=None, repr=False)
    out_path: Path | None = field(default=None, repr=False)

    def public(self) -> dict[str, Any]:
        """对外暴露字段（不含内部路径与 pass_key）。"""
        return {
            "task_id": self.id,
            "status": self.status,
            "message": self.message,
            "source_name": self.source_name,
            "target_ext": self.target_ext,
            "in_size": self.in_size,
            "out_size": self.out_size,
            "files_removed": self.files_removed,
        }


class TaskStore:
    """进程内任务表（含锁；重启即失，切片 1 可接受）。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: dict[str, Task] = {}

    def create(self, source_name: str, target_ext: str = "jpg") -> Task:
        now = time.time()
        task = Task(
            id=uuid.uuid4().hex,
            pass_key=uuid.uuid4().hex,
            status="pending",
            message="等待处理",
            source_name=source_name,
            target_ext=target_ext,
            in_size=0,
            out_size=None,
            created_at=now,
        )
        with self._lock:
            self._tasks[task.id] = task
        return task

    def get(self, task_id: str) -> Task | None:
        with self._lock:
            return self._tasks.get(task_id)

    def mark_queued(self, task: Task) -> None:
        with self._lock:
            task.status = "queued"
            task.message = "已排队"

    def mark_running(self, task: Task) -> None:
        with self._lock:
            task.status = "running"
            task.message = "转换中"

    def mark_failed(self, task: Task, message: str) -> None:
        with self._lock:
            task.status = "failed"
            task.message = message
            task.finished_at = time.time()

    def mark_succeeded(self, task: Task, out_size: int) -> None:
        with self._lock:
            task.status = "succeeded"
            task.message = "转换完成"
            task.out_size = out_size
            task.finished_at = time.time()


STORE = TaskStore()
