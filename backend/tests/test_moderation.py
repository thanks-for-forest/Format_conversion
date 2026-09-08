"""内容审核测试（切片 10d 骨架）：未启用跳过 / fail-closed / 违规拦截 / 放行。

审核启用态通过 monkeypatch config.MODERATION_API_KEY/URL 模拟；
服务商行为 monkeypatch moderation._call_provider 模拟（返回/异常）。
"""

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.core.database import get_session
from app.core.errors import ApiError
from app.main import app
from app.models.task import ConversionTask
from app.services import moderation

client = TestClient(app)


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return buf.getvalue()


def _enable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "MODERATION_API_KEY", "test-key")
    monkeypatch.setattr(config, "MODERATION_API_URL", "https://moderation.example")


def _upload_png() -> dict:
    resp = client.post(
        "/api/convert",
        files={"file": ("m.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
    )
    assert resp.status_code in (200, 451)
    return resp.json()


def test_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """默认（KEY 空）未启用：check_file 直接放行。"""
    monkeypatch.setattr(config, "MODERATION_API_KEY", "")
    monkeypatch.setattr(config, "MODERATION_API_URL", "")
    assert moderation.moderation_enabled() is False
    moderation.check_file(Path("any-file"))  # 不抛即通过


def test_enabled_without_provider_fails_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """启用但服务商未接入（NotImplementedError）→ fail-closed 451。"""
    _enable(monkeypatch)
    with pytest.raises(ApiError) as exc:
        moderation.check_file(tmp_path / "x")
    assert exc.value.status_code == 451
    assert "暂不可用" in str(exc.value.detail)


def test_api_fail_closed_on_provider_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """API 集成：审核异常 → 451、任务落 failed（文件已删，清扫兜底清记录）。"""
    _enable(monkeypatch)

    def boom(_path: Path) -> bool:
        raise RuntimeError("provider down")

    monkeypatch.setattr(moderation, "_call_provider", boom)
    resp = client.post(
        "/api/convert",
        files={"file": ("m.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
    )
    assert resp.status_code == 451
    assert "暂不可用" in resp.json()["message"]

    with get_session() as session:
        failed = (
            session.query(ConversionTask)
            .filter(ConversionTask.status == "failed")
            .order_by(ConversionTask.created_at.desc())
            .first()
        )
    assert failed is not None
    assert "安全审核" in failed.message


def test_api_blocks_violation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """服务商判定违规 → 451「未通过安全审核」。"""
    _enable(monkeypatch)
    monkeypatch.setattr(moderation, "_call_provider", lambda _p: False)
    resp = client.post(
        "/api/convert",
        files={"file": ("m.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
    )
    assert resp.status_code == 451
    assert "未通过安全审核" in resp.json()["message"]


def test_api_passes_clean_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """服务商判定通过 → 转换正常完成（eager）。"""
    _enable(monkeypatch)
    monkeypatch.setattr(moderation, "_call_provider", lambda _p: True)
    resp = client.post(
        "/api/convert",
        files={"file": ("m.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["task_id"]
