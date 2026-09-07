"""共享 Redis 客户端：进程级惰性单例（从 code_store 抽出，配额等模块复用）。"""

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
