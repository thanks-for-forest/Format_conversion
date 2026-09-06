"""任务存储 DAO：SQLite 落库（切片 3a，替换进程内内存实现）。"""

import uuid
from datetime import UTC, datetime

from app.core.database import get_session
from app.models.task import ConversionTask


def _now() -> datetime:
    """当前 UTC 时间，作终态时间戳。"""
    return datetime.now(UTC)


class TaskStore:
    """转换任务持久化仓库（session-per-operation，线程安全）。"""

    def create(
        self, source_name: str, source_format: str, target_format: str
    ) -> ConversionTask:
        """新建任务并落库，返回含 id/pass_key 的实例。"""
        task = ConversionTask(
            id=uuid.uuid4().hex,
            pass_key=uuid.uuid4().hex,
            source_name=source_name,
            source_format=source_format,
            target_format=target_format,
        )
        with get_session() as session:
            session.add(task)
            session.commit()
        return task

    def get(self, task_id: str) -> ConversionTask | None:
        """按主键读取任务（返回分离实例，标量字段已加载）。"""
        with get_session() as session:
            return session.get(ConversionTask, task_id)

    def set_in_size(self, task_id: str, size: int) -> None:
        """记录上传体积。"""
        with get_session() as session:
            task = session.get(ConversionTask, task_id)
            if task is None:
                return
            task.in_size = size
            session.commit()

    def mark_queued(self, task_id: str) -> None:
        with get_session() as session:
            task = session.get(ConversionTask, task_id)
            if task is None:
                return
            task.status = "queued"
            task.message = "已排队"
            session.commit()

    def mark_running(self, task_id: str) -> None:
        with get_session() as session:
            task = session.get(ConversionTask, task_id)
            if task is None:
                return
            task.status = "running"
            task.message = "转换中"
            session.commit()

    def mark_failed(self, task_id: str, message: str) -> None:
        with get_session() as session:
            task = session.get(ConversionTask, task_id)
            if task is None:
                return
            task.status = "failed"
            task.message = message
            task.finished_at = _now()
            session.commit()

    def mark_succeeded(self, task_id: str, out_size: int) -> None:
        with get_session() as session:
            task = session.get(ConversionTask, task_id)
            if task is None:
                return
            task.status = "succeeded"
            task.message = "转换完成"
            task.out_size = out_size
            task.finished_at = _now()
            session.commit()

    def mark_files_removed(self, task_id: str) -> None:
        """标记临时文件已删除（下载即删）。"""
        with get_session() as session:
            task = session.get(ConversionTask, task_id)
            if task is None:
                return
            task.files_removed = True
            session.commit()


STORE = TaskStore()
