"""转换接口端到端测试：上传 → 状态 → 下载（含矩阵/魔数/超限/pass_key 拦截）。"""

import io
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.core.database import get_session
from app.core.formats import HEAD_LEN, INPUT_FORMATS, OUTPUT_FORMATS
from app.main import app
from app.models.task import ConversionTask
from app.workers.convert_task import run_conversion

client = TestClient(app)


def _image_bytes(
    ext: str,
    color: str = "red",
    size: tuple[int, int] = (8, 8),
    mode: str = "RGB",
) -> bytes:
    """按注册表中的 Pillow 格式名在内存生成测试图片字节。"""
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, INPUT_FORMATS[ext].pil_name)
    return buf.getvalue()


def _png_bytes(color: str = "red", size: tuple[int, int] = (8, 8)) -> bytes:
    """生成内存 PNG 字节。"""
    return _image_bytes("png", color=color, size=size)


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


def _upload(client: TestClient, src: str, tgt: str, name: str | None = None) -> dict:
    """上传指定格式并返回创建结果 data。"""
    filename = name or f"img.{src}"
    resp = client.post(
        "/api/convert",
        files={"file": (filename, _image_bytes(src), "application/octet-stream")},
        data={"target": tgt},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == 0
    return resp.json()["data"]


def test_convert_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """上传 PNG → 任务 succeeded → 下载得到 JPEG，且下载即删。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    data = _upload(client, "png", "jpg")
    assert data["status"] == "queued"
    assert data["in_size"] > 0

    task_id, pass_key = data["task_id"], data["pass_key"]
    info = _wait_done(client, task_id, pass_key)
    assert info["status"] == "succeeded"
    assert info["out_size"] and info["out_size"] > 0

    dl = client.get(f"/api/tasks/{task_id}/download", params={"pass_key": pass_key})
    assert dl.status_code == 200
    assert dl.headers["content-disposition"].endswith('.jpg"')

    # 下载即删：二次下载应 404
    dl2 = client.get(f"/api/tasks/{task_id}/download", params={"pass_key": pass_key})
    assert dl2.status_code == 404


@pytest.mark.parametrize("src", ["png", "jpg", "webp", "bmp", "gif"])
@pytest.mark.parametrize("tgt", ["png", "jpg", "webp"])
def test_convert_matrix(
    src: str, tgt: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """5 进 × 3 出全矩阵：上传 → 转换 → 下载，结果魔数与扩展名均正确。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    data = _upload(client, src, tgt)

    info = _wait_done(client, data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info["message"]

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download",
        params={"pass_key": data["pass_key"]},
    )
    assert dl.status_code == 200
    assert OUTPUT_FORMATS[tgt].matches(dl.content[:HEAD_LEN])
    assert dl.headers["content-disposition"].endswith(f'.{tgt}"')


def test_jpeg_alias_and_flatten(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """扩展名别名 jpeg 可识别；RGBA 转 JPG 压平为 RGB。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)

    resp = client.post(
        "/api/convert",
        files={"file": ("photo.jpeg", _image_bytes("jpg"), "application/octet-stream")},
        data={"target": "jpg"},
    )
    assert resp.status_code == 200
    info = _wait_done(
        client, resp.json()["data"]["task_id"], resp.json()["data"]["pass_key"]
    )
    assert info["status"] == "succeeded"

    buf = io.BytesIO()
    Image.new("RGBA", (8, 8), (255, 0, 0, 0)).save(buf, "PNG")
    resp = client.post(
        "/api/convert",
        files={"file": ("t.png", buf.getvalue(), "image/png")},
        data={"target": "jpg"},
    )
    data = resp.json()["data"]
    dl = client.get(
        f"/api/tasks/{data['task_id']}/download",
        params={"pass_key": data["pass_key"]},
    )
    flat = Image.open(io.BytesIO(dl.content))
    assert flat.mode == "RGB"
    assert flat.size == (8, 8)


def test_reject_bad_magic_and_mismatch() -> None:
    """伪 PNG（魔数不对）与内容/扩展名不符（WebP 内容冒充 PNG）均拒绝。"""
    fake = client.post(
        "/api/convert", files={"file": ("x.png", b"not-a-png", "image/png")}
    )
    assert fake.status_code == 415

    mismatch = client.post(
        "/api/convert",
        files={"file": ("x.png", _image_bytes("webp"), "application/octet-stream")},
        data={"target": "jpg"},
    )
    assert mismatch.status_code == 415


def test_reject_bad_ext_and_target() -> None:
    """非白名单扩展名（.txt）与仅输入/未知目标（bmp、tiff）均拒绝。"""
    wrong_ext = client.post(
        "/api/convert",
        files={"file": ("x.txt", _image_bytes("png"), "application/octet-stream")},
        data={"target": "jpg"},
    )
    assert wrong_ext.status_code == 415

    input_only = client.post(
        "/api/convert",
        files={"file": ("x.png", _image_bytes("png"), "image/png")},
        data={"target": "bmp"},
    )
    assert input_only.status_code == 400

    unknown = client.post(
        "/api/convert",
        files={"file": ("x.png", _image_bytes("png"), "image/png")},
        data={"target": "tiff"},
    )
    assert unknown.status_code == 400


def test_reject_wrong_pass_key() -> None:
    """错误 pass_key 拒绝（404 防枚举）。"""
    created = client.post(
        "/api/convert",
        files={"file": ("y.png", _png_bytes("blue"), "image/png")},
        data={"target": "jpg"},
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
        "/api/convert",
        files={"file": ("big.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
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
        "/api/convert",
        files={"file": ("z.png", _png_bytes(), "image/png")},
        data={"target": "jpg"},
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
