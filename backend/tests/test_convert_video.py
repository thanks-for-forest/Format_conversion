"""视频转换测试（切片 10e）：互转 + 提取音轨端到端 + 伪装/越界拒绝。

真实转换用例依赖 ffmpeg（含 libx264，生成测试源也用它）：本机未安装时
自动跳过（CI 安装后执行）。测试源用 lavfi 合成（testsrc + sine），时长 0.5s。
"""

import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.core.video_formats import VIDEO_HEAD_LEN, VIDEO_OUTPUT_FORMATS
from app.main import app
from app.services.audio_service import find_ffmpeg

client = TestClient(app)

_HAS_FFMPEG = find_ffmpeg() is not None
_needs_ffmpeg = pytest.mark.skipif(
    not _HAS_FFMPEG, reason="本机未安装 ffmpeg（不可用）"
)


def _wait_done(task_id: str, pass_key: str, timeout: float = 120.0) -> dict:
    """轮询任务直到终态（创建响应恒为 queued）。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        info = client.get(f"/api/tasks/{task_id}", params={"pass_key": pass_key})
        data = info.json()["data"]
        if data["status"] in ("succeeded", "failed"):
            return data
        time.sleep(0.1)
    raise AssertionError("任务未在时限内完成")


def _make_video(tmp_path: Path, ext: str = "mp4") -> Path:
    """用 lavfi 合成 0.5s 带音轨测试视频（testsrc + sine）。"""
    ffmpeg = find_ffmpeg()
    assert ffmpeg is not None
    src = tmp_path / f"src.{ext}"
    cmd = [
        ffmpeg,
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=0.5:size=128x96:rate=10",
        "-f",
        "lavfi",
        "-i",
        "sine=duration=0.5:frequency=440",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-shortest",
        str(src),
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=60, check=False)
    assert src.is_file(), proc.stderr.decode(errors="replace")
    return src


def _upload_video(path: Path, target: str):
    """上传视频文件到 /api/convert。"""
    return client.post(
        "/api/convert",
        files={"file": (path.name, path.read_bytes(), "application/octet-stream")},
        data={"target": target},
    )


@_needs_ffmpeg
def test_mp4_to_webm_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """mp4 → webm 真转码：EBML 魔数、下载即删。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    src = _make_video(tmp_path)
    resp = _upload_video(src, target="webm")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl.status_code == 200
    assert VIDEO_OUTPUT_FORMATS["webm"].matches(dl.content[:VIDEO_HEAD_LEN])
    assert dl.headers["content-disposition"].endswith('.webm"')
    assert dl.headers["content-type"].startswith("video/webm")

    # 下载即删：二次下载 404
    dl2 = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl2.status_code == 404


@_needs_ffmpeg
def test_mp4_to_mkv_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """mp4 → mkv（libx264）：EBML 魔数正确。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    src = _make_video(tmp_path)
    resp = _upload_video(src, target="mkv")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl.status_code == 200
    assert VIDEO_OUTPUT_FORMATS["mkv"].matches(dl.content[:VIDEO_HEAD_LEN])


@_needs_ffmpeg
def test_extract_audio_mp4_to_mp3(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """视频 → mp3 提取音轨：视频源 + 音频目标，复用音频链路。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    src = _make_video(tmp_path)
    resp = _upload_video(src, target="mp3")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl.status_code == 200
    # MP3 魔数：ID3 标签或 MPEG 帧同步
    head = dl.content[:VIDEO_HEAD_LEN]
    assert head[:3] == b"ID3" or head[0] == 0xFF


@_needs_ffmpeg
def test_video_bad_magic_and_bad_target(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """伪 .mp4（文本内容）415；视频源请求图片目标 400。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    fake = client.post(
        "/api/convert",
        files={"file": ("x.mp4", b"not a video at all", "application/octet-stream")},
        data={"target": "webm"},
    )
    assert fake.status_code == 415

    src = _make_video(tmp_path)
    bad_target = _upload_video(src, target="png")
    assert bad_target.status_code == 400
