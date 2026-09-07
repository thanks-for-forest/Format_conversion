"""验证码存储与限流：Redis（切片 5a，与 ARCH §4 一致）。

键设计：
  fc:code:{email}          → 6 位验证码（TTL CODE_TTL_SEC）
  fc:attempts:{email}      → 该验证码已尝试次数（TTL 同验证码）
  fc:cd:{email}            → 发送冷却标记（TTL CODE_SEND_COOLDOWN_SEC）
"""

import secrets

import redis

from app.core import config

_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    """返回进程级 Redis 客户端（惰性创建）。"""
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            config.REDIS_URL, decode_responses=True, socket_timeout=5
        )
    return _client


def reset_client() -> None:
    """释放客户端缓存（测试隔离用）。"""
    global _client
    _client = None


def send_allowed(email: str) -> bool:
    """发送冷却检查：冷却期内不允许再次发送。"""
    return bool(
        get_client().set(
            f"fc:cd:{email}", "1", nx=True, ex=config.CODE_SEND_COOLDOWN_SEC
        )
    )


def save_code(email: str) -> str:
    """生成并存储 6 位验证码，返回明文（由 mailer 发送）。"""
    code = f"{secrets.randbelow(1_000_000):06d}"
    client = get_client()
    with client.pipeline() as pipe:
        pipe.set(f"fc:code:{email}", code, ex=config.CODE_TTL_SEC)
        pipe.delete(f"fc:attempts:{email}")
        pipe.execute()
    return code


def verify_code(email: str, code: str) -> bool:
    """校验验证码：命中即作废；错误计次数，超上限作废防爆破。"""
    client = get_client()
    key = f"fc:code:{email}"
    stored = client.get(key)
    if stored is None:
        return False
    if secrets.compare_digest(str(stored), code):
        client.delete(key, f"fc:attempts:{email}")
        return True
    attempts = client.incr(f"fc:attempts:{email}")
    client.expire(f"fc:attempts:{email}", config.CODE_TTL_SEC)
    if attempts >= config.CODE_MAX_ATTEMPTS:
        client.delete(key, f"fc:attempts:{email}")
    return False
