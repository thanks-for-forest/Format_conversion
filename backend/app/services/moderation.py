"""内容安全审核服务（切片 10d 骨架，PRD 3.6）。

语义（已与产品确认）：
- MODERATION_API_KEY 为空 = 未启用：直接放行（启动时有 WARNING 提示）；
- 启用后按 fail-closed 处理：审核服务商调用超时/异常一律拒绝本次转换，
  **在服务商真正接入前配置 KEY 会导致所有上传被拒绝**（_call_provider 未实现）；
- 拦截响应统一 451，配额已扣不退还（违规上传本身视为滥用成本）。

真服务商（阿里云内容安全 / 腾讯云 CMS 等）接入时仅需实现 _call_provider，
按需补充字节数据签名（压缩包端点的内存内容审核在接入时一并设计）。
"""

import logging
from pathlib import Path

from app.core import config
from app.core.errors import ApiError

logger = logging.getLogger(__name__)


def moderation_enabled() -> bool:
    """审核是否启用：KEY 与 URL 均已配置。"""
    return bool(config.MODERATION_API_KEY and config.MODERATION_API_URL)


def _call_provider(file_path: Path) -> bool:
    """调用审核服务商；返回 True=通过，False=违规。

    骨架阶段未实现任何服务商调用，启用态直接抛 NotImplementedError
    （fail-closed 语义生效：配置了 KEY 即全量拒绝，防止误以为已有审核能力）。
    """
    raise NotImplementedError("内容审核服务商未接入（切片 10d 骨架）")


def check_file(file_path: Path) -> None:
    """审核单个已落盘的上传文件；违规/审核异常 → ApiError(451)。"""
    if not moderation_enabled():
        return
    try:
        passed = _call_provider(file_path)
    except Exception as exc:  # noqa: BLE001 fail-closed：任何异常都拒绝
        logger.error("内容审核服务异常（fail-closed）: %s", exc)
        raise ApiError(451, "内容审核服务暂不可用，请稍后重试") from exc
    if not passed:
        logger.warning("文件未通过安全审核: %s", file_path.name)
        raise ApiError(451, "文件未通过安全审核")
