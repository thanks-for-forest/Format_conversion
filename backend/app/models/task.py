"""转换任务 ORM 模型（切片 3a：替换内存 TaskStore）。"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core import config
from app.models import Base


def _utcnow() -> datetime:
    """返回当前 UTC 时间（作列默认值）。"""
    return datetime.now(UTC)


class ConversionTask(Base):
    """一次文件转换任务。文件路径由 id + 格式派生，不落库。"""

    __tablename__ = "conversion_tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    pass_key: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True, default="pending")
    message: Mapped[str] = mapped_column(String(255), default="等待处理")
    source_name: Mapped[str] = mapped_column(String(255))
    source_format: Mapped[str] = mapped_column(String(16))
    target_format: Mapped[str] = mapped_column(String(16))
    in_size: Mapped[int] = mapped_column(BigInteger, default=0)
    out_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    files_removed: Mapped[bool] = mapped_column(Boolean, default=False)

    @property
    def in_path(self) -> Path:
        """上传文件临时路径（确定性命名）。"""
        return config.TMP_DIR / f"{self.id}.{self.source_format}"

    @property
    def out_path(self) -> Path:
        """结果文件临时路径（确定性命名）。"""
        return config.TMP_DIR / f"{self.id}.{self.target_format}"

    def public(self) -> dict[str, Any]:
        """对外暴露字段（不含 pass_key 与内部路径）。"""
        return {
            "task_id": self.id,
            "status": self.status,
            "message": self.message,
            "source_name": self.source_name,
            "target_ext": self.target_format,
            "in_size": self.in_size,
            "out_size": self.out_size,
            "files_removed": self.files_removed,
        }
