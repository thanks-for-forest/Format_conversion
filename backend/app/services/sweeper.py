"""过期任务清扫（切片 7）：由 Celery beat 定时调度。

三类清理对象：
- 超时未下载的文件：终态任务（succeeded/failed）超过文件保留时长仍未
  files_removed → 删除临时文件并标记；
- 卡死任务：pending/queued/running 停留超过判定时长 → 标记 failed 并
  清理可能残留的文件；
- 过期记录：已清文件且终态时间超过记录保留天数 → 删除行。
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select

from app.core import config
from app.core.database import get_session
from app.models.task import ConversionTask

FINAL_STATUSES = ("succeeded", "failed")
ACTIVE_STATUSES = ("pending", "queued", "running")


def _unlink_task_files(task: ConversionTask) -> None:
    """删除任务的输入/输出临时文件（确定性命名，可能不存在）。"""
    task.in_path.unlink(missing_ok=True)
    task.out_path.unlink(missing_ok=True)


def sweep(now: datetime | None = None) -> dict[str, int]:
    """执行一轮清扫，返回各类清理数量（可直接调用以便测试）。"""
    now = now or datetime.now(UTC)
    file_cutoff = now - timedelta(minutes=config.SWEEP_FILE_RETENTION_MIN)
    stuck_cutoff = now - timedelta(minutes=config.SWEEP_STUCK_AFTER_MIN)
    row_cutoff = now - timedelta(days=config.SWEEP_ROW_RETENTION_DAYS)
    stats = {"files_swept": 0, "stuck_marked": 0, "rows_deleted": 0}

    with get_session() as session:
        # 1) 超时未下载：终态任务文件保留超时 → 删文件 + 标记
        stale = session.scalars(
            select(ConversionTask).where(
                ConversionTask.files_removed.is_(False),
                ConversionTask.status.in_(FINAL_STATUSES),
                ConversionTask.finished_at < file_cutoff,
            )
        ).all()
        for task in stale:
            _unlink_task_files(task)
            task.files_removed = True
            stats["files_swept"] += 1

        # 2) 卡死任务：长时间停留在活动态 → 标记失败 + 清残留文件
        stuck = session.scalars(
            select(ConversionTask).where(
                ConversionTask.status.in_(ACTIVE_STATUSES),
                ConversionTask.created_at < stuck_cutoff,
            )
        ).all()
        for task in stuck:
            _unlink_task_files(task)
            task.files_removed = True
            task.status = "failed"
            task.message = "超时未完成，已被系统清理"
            task.finished_at = now
            stats["stuck_marked"] += 1

        session.commit()

        # 3) 过期记录：已清文件且终态超过保留天数 → 删行
        #    finished_at 为空的活动态记录按创建时间兜底判断
        expired = session.scalars(
            select(ConversionTask).where(
                ConversionTask.files_removed.is_(True),
                or_(
                    ConversionTask.finished_at < row_cutoff,
                    ConversionTask.finished_at.is_(None)
                    & (ConversionTask.created_at < row_cutoff),
                ),
            )
        ).all()
        for task in expired:
            session.delete(task)
            stats["rows_deleted"] += 1
        session.commit()

    return stats
