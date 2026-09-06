"""转换接口端到端测试：上传 → 状态 → 下载（含魔数/超限/pass_key 拦截）。"""

import io
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.core.database import get_session
from app.main import app
from app.models.task import ConversionTask
from app.workers.convert_task import run_conversion

client = TestClient(app)


def _png_bytes(color: str = "red", size: tuple[int, int] = (8, 8)) -> bytes:
    """生成内存 PNG 字节。"""
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def _wait_done(
    client: TestClient, task_id: str, pass_key: str, timeout: float = 5.0
) -> dict:
    """轮询任务直到终态，超时则失败。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        info = client.get(f"/api/tasks/{task_id}", params={"pass_key": pass_key})
        data = info.json()["data"]
        if data["status"] in ("succeeded", "failed"):
            return data
        time.sleep(0.05)
    raise AssertionError("任务未在时限内完成")


def test_convert_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """上传 PNG → 任务 succeeded → 下载得到 JPEG，且下载即删。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    resp = client.post(
        "/api/convert",
        files={"file": ("demo.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    data = body["data"]
    assert data["status"] == "queued"

    task_id, pass_key = data["task_id"], data["pass_key"]
    info = _wait_done(client, task_id, pass_key)
    assert info["status"] == "succeeded"
    assert info["out_size"] and info["out_size"] > 0

    dl = client.get(f"/api/tasks/{task_id}/download", params={"pass_key": pass_key})
    assert dl.status_code == 200
    assert dl.content[:2] == b"\xff\xd8"  # JPEG 魔数
    assert dl.headers["content-disposition"].endswith('.jpg"')

    # 下载即删：二次下载应 404
    dl2 = client.get(f"/api/tasks/{task_id}/download", params={"pass_key": pass_key})
    assert dl2.status_code == 404


def test_reject_bad_magic_and_ext() -> None:
    """伪 PNG（魔数不对）与非 .png 扩展名均拒绝。"""
    fake = client.post(
        "/api/convert", files={"file": ("x.png", b"not-a-png", "image/png")}
    )
    assert fake.status_code == 415

    wrong_ext = client.post(
        "/api/convert", files={"file": ("x.txt", _png_bytes(), "image/png")}
    )
    assert wrong_ext.status_code == 415


def test_reject_bad_target_and_wrong_pass_key() -> None:
    """非法目标格式与错误 pass_key 均拒绝。"""
    bad_target = client.post(
        "/api/convert",
        files={"file": ("x.png", _png_bytes(), "image/png")},
        data={"target": "webp"},
    )
    assert bad_target.status_code == 400

    created = client.post(
        "/api/convert",
        files={"file": ("y.png", _png_bytes("blue"), "image/png")},
    )
    task_id = created.json()["data"]["task_id"]
    wrong = client.get(f"/api/tasks/{task_id}", params={"pass_key": "wrong"})
    assert wrong.status_code == 404


def test_reject_oversize(
    tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """超过上限即拒绝（413）。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path_factory.mktemp("oversize"))
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    resp = client.post(
        "/api/convert", files={"file": ("big.png", _png_bytes(), "image/png")}
    )
    assert resp.status_code == 413


def test_enqueue_failure_marks_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """投递 Celery 失败（broker 不可用）：返回 503，任务落 failed。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    monkeypatch.setattr(
        run_conversion, "delay", lambda _task_id: (_ for _ in ()).throw(RuntimeError)
    )
    resp = client.post(
        "/api/convert", files={"file": ("z.png", _png_bytes(), "image/png")}
    )
    assert resp.status_code == 503
    assert "系统繁忙" in resp.json()["message"]

    with get_session() as session:
        failed = (
            session.query(ConversionTask)
            .filter(ConversionTask.status == "failed")
            .order_by(ConversionTask.created_at.desc())
            .first()
        )
    assert failed is not None
    assert failed.status == "failed"
    assert "系统繁忙" in failed.message
