"""验证码存储与限流：Redis（切片 5a，与 ARCH §4 一致）。

键设计：
  fc:code:{email}          → 6 位验证码（TTL CODE_TTL_SEC）
  fc:attempts:{email}      → 该验证码已尝试次数（TTL 同验证码）
  fc:cd:{email}            → 发送冷却标记（TTL CODE_SEND_COOLDOWN_SEC）
"""

import secrets

from app.core import config
from app.services.redis_client import get_client, reset_client

__all__ = ["get_client", "reset_client", "send_allowed", "save_code", "verify_code"]


def send_allowed(email: str, ip: str | None = None) -> bool:
    """发送冷却检查：邮箱冷却 + IP 小时限流（审计 M1）双闸。

    IP 限流先于邮箱冷却：超限直接拒绝，不占用该邮箱的冷却坑。
    """
    client = get_client()
    if ip:
        ip_key = f"fc:sendip:{ip}"
        count = client.incr(ip_key)
        if count == 1:
            client.expire(ip_key, 3600)
        if count > config.SEND_IP_HOURLY_LIMIT:
            return False
    return bool(
        client.set(f"fc:cd:{email}", "1", nx=True, ex=config.CODE_SEND_COOLDOWN_SEC)
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
