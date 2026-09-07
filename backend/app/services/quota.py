"""配额服务（切片 5b，口径见 PRD 3.4）。

分层：
- 登录用户：SQLite quota_usage 日表，按 UTC 自然日累计。
- 匿名用户：Redis 按 IP 计数，键含日期、当日过期（跨日换键 + TTL 兜底）。
- 本地转换计次不计流量（浏览器端完成，服务端无流量成本）。

Redis 键：
  fc:quota:{yyyymmdd}:{ip} → hash {count, traffic}（TTL 86400 防残留）

说明：次数/流量的检查与扣减非严格原子（check-then-incr），并发下可能
轻微超限，免费站点口径下可接受。
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core import config
from app.core.database import get_session
from app.core.errors import ApiError
from app.models.quota import QuotaUsage
from app.services.redis_client import get_client

ANON_KEY_TTL_SEC = 86_400


@dataclass(frozen=True)
class QuotaLimits:
    """某身份档位的每日限额与单文件上限。"""

    count: int
    traffic_bytes: int
    max_upload_bytes: int


def limits_for(user_id: str | None) -> QuotaLimits:
    """按登录态返回限额档位。"""
    if user_id:
        return QuotaLimits(
            config.USER_DAILY_COUNT,
            config.USER_DAILY_TRAFFIC_BYTES,
            config.MAX_UPLOAD_BYTES_USER,
        )
    return QuotaLimits(
        config.ANON_DAILY_COUNT,
        config.ANON_DAILY_TRAFFIC_BYTES,
        config.MAX_UPLOAD_BYTES,
    )


def _today() -> date:
    """当前 UTC 自然日。"""
    return datetime.now(UTC).date()


def _anon_key(ip: str) -> str:
    return f"fc:quota:{_today():%Y%m%d}:{ip}"


def _next_reset_at() -> datetime:
    """下一个 UTC 零点（配额重置时刻）。"""
    tomorrow = _today() + timedelta(days=1)
    return datetime.combine(tomorrow, time.min, tzinfo=UTC)


def _reset_in_text() -> str:
    """距离重置的剩余时长（人类可读）。"""
    seconds = int((_next_reset_at() - datetime.now(UTC)).total_seconds())
    hours, remainder = divmod(max(seconds, 0) // 60, 60)
    if hours > 0:
        return f"约 {hours} 小时 {remainder} 分后"
    return f"约 {remainder} 分钟后"


def _count_message(limits: QuotaLimits) -> str:
    return f"今日转换次数已达上限（{limits.count} 次），{_reset_in_text()}重置"


def _traffic_message() -> str:
    return f"今日上传流量已达上限，{_reset_in_text()}重置"


def get_usage(user_id: str | None, ip: str) -> tuple[int, int]:
    """读取当日已用（次数, 流量字节）。"""
    if user_id:
        with get_session() as session:
            row = (
                session.query(QuotaUsage)
                .filter(
                    QuotaUsage.user_id == user_id,
                    QuotaUsage.usage_date == _today(),
                )
                .first()
            )
            if row is None:
                return 0, 0
            return int(row.conversion_count), int(row.traffic_bytes)
    data = get_client().hgetall(_anon_key(ip))
    return int(data.get("count", 0)), int(data.get("traffic", 0))


def _consume(user_id: str | None, ip: str, traffic_bytes: int) -> None:
    """扣减：次数 +1，流量 +traffic_bytes。"""
    if user_id:
        with get_session() as session:
            stmt = sqlite_insert(QuotaUsage).values(
                user_id=user_id,
                usage_date=_today(),
                conversion_count=1,
                traffic_bytes=traffic_bytes,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "usage_date"],
                set_={
                    "conversion_count": QuotaUsage.conversion_count + 1,
                    "traffic_bytes": QuotaUsage.traffic_bytes + traffic_bytes,
                },
            )
            session.execute(stmt)
            session.commit()
        return
    client = get_client()
    key = _anon_key(ip)
    pipe = client.pipeline()
    pipe.hincrby(key, "count", 1)
    pipe.hincrby(key, "traffic", traffic_bytes)
    pipe.expire(key, ANON_KEY_TTL_SEC)
    pipe.execute()


def consume(user_id: str | None, ip: str, traffic_bytes: int = 0) -> None:
    """服务端转换配额：预检并扣减（次数 +1、流量 +size）；超限抛 429。"""
    limits = limits_for(user_id)
    count, traffic = get_usage(user_id, ip)
    if count + 1 > limits.count:
        raise ApiError(429, _count_message(limits))
    if traffic + traffic_bytes > limits.traffic_bytes:
        raise ApiError(429, _traffic_message())
    _consume(user_id, ip, traffic_bytes)


def consume_local(user_id: str | None, ip: str) -> None:
    """本地转换计次：只计次数不计流量；次数超限抛 429。"""
    limits = limits_for(user_id)
    count, _ = get_usage(user_id, ip)
    if count + 1 > limits.count:
        raise ApiError(429, _count_message(limits))
    _consume(user_id, ip, 0)


def summary(user_id: str | None, ip: str) -> dict[str, object]:
    """前端预检数据：已用/限额/重置时刻。"""
    limits = limits_for(user_id)
    count, traffic = get_usage(user_id, ip)
    return {
        "authenticated": user_id is not None,
        "used": {"count": count, "traffic_bytes": traffic},
        "limit": {
            "count": limits.count,
            "traffic_bytes": limits.traffic_bytes,
            "max_upload_bytes": limits.max_upload_bytes,
        },
        "reset_at": _next_reset_at().isoformat(),
    }
