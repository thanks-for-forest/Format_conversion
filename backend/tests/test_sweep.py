"""清扫逻辑测试（切片 7）：文件过期 / 未超时不动 / 卡死 / 记录过期。"""

from datetime import UTC, datetime, timedelta

from app.core import config
from app.core.database import get_session
from app.models.task import ConversionTask
from app.services import sweeper
from app.services.task_store import STORE


def _backdate(task_id: str, **fields: object) -> None:
    """直接改库回填时间/状态等字段。"""
    with get_session() as session:
        row = session.get(ConversionTask, task_id)
        assert row is not None
        for key, value in fields.items():
            setattr(row, key, value)
        session.commit()


def _write_file(task_id: str, ext: str) -> object:
    path = config.TMP_DIR / f"{task_id}.{ext}"
    path.write_bytes(b"x")
    return path


def test_sweeps_old_finished_files() -> None:
    """终态任务超过文件保留时长：删文件、标记 files_removed、保留记录。"""
    now = datetime.now(UTC)
    task = STORE.create("a.png", "png", "jpg")
    age = timedelta(minutes=config.SWEEP_FILE_RETENTION_MIN + 5)
    _backdate(task.id, status="succeeded", finished_at=now - age)
    in_path, out_path = _write_file(task.id, "png"), _write_file(task.id, "jpg")

    stats = sweeper.sweep()

    assert stats["files_swept"] == 1
    assert not in_path.exists() and not out_path.exists()
    row = STORE.get(task.id)
    assert row is not None and row.files_removed


def test_keeps_recent_finished_files() -> None:
    """刚完成的任务不在清扫范围。"""
    task = STORE.create("a.png", "png", "jpg")
    _backdate(task.id, status="succeeded", finished_at=datetime.now(UTC))
    in_path = _write_file(task.id, "png")

    stats = sweeper.sweep()

    assert stats["files_swept"] == 0
    assert in_path.exists()


def test_marks_stuck_active_tasks() -> None:
    """活动态停留超时的卡死任务：标 failed + 清残留文件 + 行保留。"""
    now = datetime.now(UTC)
    task = STORE.create("a.png", "png", "jpg")
    age = timedelta(minutes=config.SWEEP_STUCK_AFTER_MIN + 5)
    _backdate(task.id, status="queued", created_at=now - age)
    in_path = _write_file(task.id, "png")

    stats = sweeper.sweep()

    assert stats["stuck_marked"] == 1
    assert not in_path.exists()
    row = STORE.get(task.id)
    assert row is not None
    assert row.status == "failed" and row.files_removed


def test_deletes_expired_rows() -> None:
    """已清文件且终态超过记录保留天数 → 删行。"""
    now = datetime.now(UTC)
    task = STORE.create("a.png", "png", "jpg")
    age = timedelta(days=config.SWEEP_ROW_RETENTION_DAYS + 1)
    _backdate(task.id, status="failed", files_removed=True, finished_at=now - age)

    stats = sweeper.sweep()

    assert stats["rows_deleted"] == 1
    assert STORE.get(task.id) is None


def test_keeps_recent_rows() -> None:
    """未到期的已清文件记录不删行。"""
    now = datetime.now(UTC)
    task = STORE.create("a.png", "png", "jpg")
    _backdate(
        task.id,
        status="failed",
        files_removed=True,
        finished_at=now - timedelta(days=1),
    )

    stats = sweeper.sweep()

    assert stats["rows_deleted"] == 0
    assert STORE.get(task.id) is not None


def test_old_active_row_kept_after_stuck_mark() -> None:
    """极老的活动态任务先被标卡死（行保留），不会被同轮删行。"""
    now = datetime.now(UTC)
    task = STORE.create("b.png", "png", "jpg")
    age = timedelta(days=config.SWEEP_ROW_RETENTION_DAYS + 1)
    _backdate(task.id, status="running", files_removed=True, created_at=now - age)

    stats = sweeper.sweep()

    assert stats["stuck_marked"] == 1
    assert stats["rows_deleted"] == 0
    row = STORE.get(task.id)
    assert row is not None and row.status == "failed"


def test_beat_task_callable() -> None:
    """beat 注册的清扫任务可直接同步调用（eager 模式下等价执行）。"""
    from app.workers.sweep_task import sweep_expired

    assert sweep_expired()["rows_deleted"] >= 0
