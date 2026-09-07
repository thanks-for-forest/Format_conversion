"""音频转换测试（切片 10b）：音频互转端到端 + 伪装/越界拒绝。

真实转换用例依赖 ffmpeg：本机未安装时自动跳过（CI 安装后执行）。
测试源文件用标准库 wave 生成，不依赖 ffmpeg 造数据。
"""

import io
import math
import struct
import time
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.core.audio_formats import AUDIO_HEAD_LEN, AUDIO_OUTPUT_FORMATS
from app.main import app
from app.services.audio_service import find_ffmpeg

client = TestClient(app)

_HAS_FFMPEG = find_ffmpeg() is not None
_needs_ffmpeg = pytest.mark.skipif(
    not _HAS_FFMPEG, reason="本机未安装 ffmpeg（不可用）"
)


def _wait_done(task_id: str, pass_key: str, timeout: float = 60.0) -> dict:
    """轮询任务直到终态（创建响应恒为 queued）。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        info = client.get(f"/api/tasks/{task_id}", params={"pass_key": pass_key})
        data = info.json()["data"]
        if data["status"] in ("succeeded", "failed"):
            return data
        time.sleep(0.05)
    raise AssertionError("任务未在时限内完成")


def _wav_bytes(sample_rate: int = 8000, seconds: float = 0.2) -> bytes:
    """生成 440Hz 正弦波 16bit 单声道 WAV（标准库 wave，无外部依赖）。"""
    buf = io.BytesIO()
    total = int(sample_rate * seconds)
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        frames = b"".join(
            struct.pack(
                "<h", int(12000 * math.sin(2 * math.pi * 440 * i / sample_rate))
            )
            for i in range(total)
        )
        w.writeframes(frames)
    return buf.getvalue()


def _upload_audio(name: str, content: bytes, target: str = "mp3"):
    """上传音频类文件到 /api/convert。"""
    return client.post(
        "/api/convert",
        files={"file": (name, content, "application/octet-stream")},
        data={"target": target},
    )


@_needs_ffmpeg
def test_wav_to_mp3_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """wav 上传 → eager 转换 → 下载 MP3（ID3 或 MPEG 帧魔数），下载即删。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    resp = _upload_audio("tone.wav", _wav_bytes(), target="mp3")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info
    assert info["out_size"] and info["out_size"] > 0

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl.status_code == 200
    assert AUDIO_OUTPUT_FORMATS["mp3"].matches(dl.content[:AUDIO_HEAD_LEN])
    assert dl.headers["content-disposition"].endswith('.mp3"')
    assert dl.headers["content-type"].startswith("audio/mpeg")

    # 下载即删：二次下载 404
    dl2 = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl2.status_code == 404


@_needs_ffmpeg
@pytest.mark.parametrize("tgt", ["flac", "ogg", "m4a", "aac"])
def test_wav_to_formats(
    tgt: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """wav → flac/ogg/m4a/aac 全部走通，产物魔数与扩展名正确。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    resp = _upload_audio("tone.wav", _wav_bytes(), target=tgt)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl.status_code == 200
    assert AUDIO_OUTPUT_FORMATS[tgt].matches(dl.content[:AUDIO_HEAD_LEN])
    assert dl.headers["content-disposition"].endswith(f'.{tgt}"')


@_needs_ffmpeg
def test_mp3_to_wav_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """wav→mp3 的产物作输入回转 wav（mp3 源魔数 MPEG 帧），验证双向。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    create = _upload_audio("tone.wav", _wav_bytes(), target="mp3")
    data = create.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info
    mp3 = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    ).content

    resp = _upload_audio("tone.mp3", mp3, target="wav")
    assert resp.status_code == 200, resp.text
    data2 = resp.json()["data"]
    info2 = _wait_done(data2["task_id"], data2["pass_key"])
    assert info2["status"] == "succeeded", info2

    dl = client.get(
        f"/api/tasks/{data2['task_id']}/download",
        params={"pass_key": data2["pass_key"]},
    )
    assert dl.status_code == 200
    assert AUDIO_OUTPUT_FORMATS["wav"].matches(dl.content[:AUDIO_HEAD_LEN])


def test_audio_rejects_binary_disguise() -> None:
    """二进制（PE 头）伪装 .mp3 扩展名：415 拒绝。"""
    resp = _upload_audio("evil.mp3", b"MZ\x90\x00\x03\x00\x00\x00")
    assert resp.status_code == 415


def test_audio_rejects_wrong_content() -> None:
    """文本内容冒充 .flac：魔数不符 415。"""
    resp = _upload_audio("x.flac", b"not audio at all")
    assert resp.status_code == 415


def test_audio_rejects_unknown_ext_and_target() -> None:
    """音频分支：非白名单源扩展名 415；同格式/未知目标 400。"""
    wma = _upload_audio("x.wma", b"\x30\x26\xb2\x75\x8e\x66\xcf\x11")
    assert wma.status_code == 415

    # 目标 mp4 不在音频输出白名单（视频后续切片），400
    bad_target = _upload_audio("x.mp3", b"ID3\x04", target="mp4")
    assert bad_target.status_code == 400
