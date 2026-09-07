"""压缩包测试（切片 8）：打包读回 / 解压双格式 / 安全防护 / 端点行为。"""

import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.errors import ApiError
from app.main import app
from app.services import archive_service


def _zip_bytes(entries: list[tuple[str, bytes]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries:
            zf.writestr(name, data)
    return buf.getvalue()


def _read_zip(data: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        return {info.filename: zf.read(info) for info in zf.infolist()}


# ===== 服务层 =====


def test_pack_dedup_and_chinese_names() -> None:
    packed = archive_service.pack(
        [("a.txt", b"1"), ("a.txt", b"2"), ("图片 说明.png", b"3")]
    )
    entries = _read_zip(packed)
    assert entries["a.txt"] == b"1"
    assert entries["a(1).txt"] == b"2"
    assert entries["图片 说明.png"] == b"3"


def test_safe_name_strips_paths() -> None:
    assert archive_service.safe_name("../../etc/passwd") == "passwd"
    assert archive_service.safe_name("C:\\evil\\x.txt") == "x.txt"


def test_extract_zip_roundtrip() -> None:
    payload = [("a.txt", b"hello"), ("b/c.bin", b"\x00\x01")]
    entries = _read_zip(archive_service.extract(_zip_bytes(payload)))
    assert entries["a.txt"] == b"hello"
    assert entries["c.bin"] == b"\x00\x01"


def test_extract_tar_gz_to_zip(tmp_path: Path) -> None:
    import tarfile

    src = tmp_path / "a.tar.gz"
    with tarfile.open(src, "w:gz") as tf:
        info = tarfile.TarInfo("doc/readme.txt")
        payload = b"tar content"
        info.size = len(payload)
        tf.addfile(info, io.BytesIO(payload))
    result = archive_service.extract(src.read_bytes())
    entries = _read_zip(result)
    assert entries["readme.txt"] == payload


def test_rejects_unknown_magic() -> None:
    with pytest.raises(ApiError) as ei:
        archive_service.extract(b"not-an-archive!")
    assert ei.value.status_code == 415


def test_rejects_path_traversal() -> None:
    evil = _zip_bytes([("../evil.txt", b"x")])
    with pytest.raises(ApiError) as ei:
        archive_service.extract(evil)
    assert ei.value.status_code == 415


def test_rejects_zip_bomb_total_limit() -> None:
    # 300 条 1MB 零字节（deflate 后仅约 300KB），解压总量超 256MB 上限
    payload = b"\x00" * (1024 * 1024)
    entries = [(f"f{i}.bin", payload) for i in range(300)]
    bomb = _zip_bytes(entries)
    assert len(bomb) < 1024 * 1024  # 确认高压缩比成立
    with pytest.raises(ApiError) as ei:
        archive_service.extract(bomb)
    assert ei.value.status_code == 413


# ===== 端点 =====


def test_pack_endpoint_and_quota() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/archive/pack",
        files=[("files", ("a.txt", b"1")), ("files", ("b.txt", b"2"))],
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert _read_zip(resp.content) == {"a.txt": b"1", "b.txt": b"2"}
    summary = client.get("/api/quota/summary").json()["data"]
    assert summary["used"]["count"] == 1
    assert summary["used"]["traffic_bytes"] == 2  # a+b 各 1 字节


def test_extract_endpoint_and_errors() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/archive/extract",
        files={"file": ("x.zip", _zip_bytes([("n.txt", b"ok")]))},
    )
    assert resp.status_code == 200
    assert _read_zip(resp.content) == {"n.txt": b"ok"}

    bad = client.post("/api/archive/extract", files={"file": ("x.bin", b"nope")})
    assert bad.status_code == 415

    empty = client.post("/api/archive/pack", files=[])
    assert empty.status_code == 400
