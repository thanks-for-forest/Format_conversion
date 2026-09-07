"""登录用户配额日表 ORM 模型（切片 5b）。匿名配额走 Redis，不落库。"""

from datetime import date

from sqlalchemy import BigInteger, Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class QuotaUsage(Base):
    """登录用户按自然日（UTC）累计的服务端转换次数与流量。"""

    __tablename__ = "quota_usage"
    __table_args__ = (
        UniqueConstraint("user_id", "usage_date", name="uq_quota_user_date"),
    )

    # SQLite 仅 INTEGER PRIMARY KEY 作 rowid 别名可自增，故用 variant
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    usage_date: Mapped[date] = mapped_column(Date)
    conversion_count: Mapped[int] = mapped_column(BigInteger, default=0)
    traffic_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
