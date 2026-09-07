"""压缩包服务（切片 8）：打包与解压，全程内存、不落盘。

口径：
- pack：多文件 → ZIP（zipfile deflate）；文件名取 basename 防路径穿越。
- extract：ZIP / TAR.GZ → 重打包为 ZIP 交付（统一单输出，便于下载）；
  TAR.GZ → ZIP 是真实格式转换，ZIP → ZIP 为透传重打包。
- 防 zip bomb：条目数 / 单条大小 / 解压总量三重上限（超限 413）。

内存峰值说明：上限内单请求峰值约 600MB（上传+解压+重打包），
免费站低并发可接受，已记 ARCH v0.15。
"""

import io
import tarfile
import zipfile

from app.core.errors import ApiError

# 防 zip bomb 三重上限（切片 8）
MAX_ENTRIES = 1000
MAX_ENTRY_BYTES = 128 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024

ZIP_MAGIC = b"PK\x03\x04"
GZIP_MAGIC = b"\x1f\x8b"


def is_zip(head: bytes) -> bool:
    return head[:4] == ZIP_MAGIC


def is_gzip(head: bytes) -> bool:
    return head[:2] == GZIP_MAGIC


def safe_name(name: str) -> str:
    """取 basename 并去掉目录成分，防路径穿越/绝对路径。"""
    name = name.replace("\\", "/")
    return name.rsplit("/", 1)[-1]


def pack(files: list[tuple[str, bytes]]) -> bytes:
    """多文件打包为 ZIP；文件名统一取 basename。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        seen: dict[str, int] = {}
        for name, data in files:
            base = safe_name(name) or "file"
            # 同名去重：file.txt / file(1).txt
            count = seen.get(base, 0)
            seen[base] = count + 1
            if count:
                stem, dot, ext = base.rpartition(".")
                base = f"{stem}({count}).{ext}" if dot else f"{base}({count})"
            zf.writestr(base, data)
    return buf.getvalue()


def _check_entry(name: str, size: int, stats: dict[str, int]) -> None:
    """单条目安全检查（条目数 / 大小 / 总量）。"""
    stats["total"] += size
    stats["count"] += 1
    entry_mb = MAX_ENTRY_BYTES // (1024 * 1024)
    total_mb = MAX_TOTAL_BYTES // (1024 * 1024)
    if stats["count"] > MAX_ENTRIES:
        raise ApiError(413, f"压缩包含条目过多（上限 {MAX_ENTRIES} 个）")
    if size > MAX_ENTRY_BYTES:
        raise ApiError(413, f"压缩包含超大文件（单条上限 {entry_mb}MB）")
    if stats["total"] > MAX_TOTAL_BYTES:
        raise ApiError(413, f"解压总量超限（上限 {total_mb}MB）")
    if name.endswith("/"):
        return  # 目录条目跳过
    safe_name(name)  # 仅校验可清洗，实际保留原始相对路径交由重打包判定


def _read_zip(data: bytes) -> list[tuple[str, bytes]]:
    """读 ZIP 条目（拒绝路径穿越条目）。"""
    stats = {"count": 0, "total": 0}
    entries: list[tuple[str, bytes]] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for info in zf.infolist():
                _check_entry(info.filename, info.file_size, stats)
                if info.filename.endswith("/"):
                    continue
                clean = safe_name(info.filename)
                if clean != info.filename and ".." in info.filename:
                    raise ApiError(415, "压缩包含不安全的路径条目")
                entries.append((clean, zf.read(info)))
    except zipfile.BadZipFile as exc:
        raise ApiError(415, "ZIP 文件已损坏或格式不合法") from exc
    return entries


def _read_tar_gz(data: bytes) -> list[tuple[str, bytes]]:
    """读 TAR.GZ 条目（拒绝路径穿越条目）。"""
    stats = {"count": 0, "total": 0}
    entries: list[tuple[str, bytes]] = []
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            for member in tf.getmembers():
                if not member.isfile():
                    continue
                _check_entry(member.name, member.size, stats)
                if ".." in member.name:
                    raise ApiError(415, "压缩包含不安全的路径条目")
                clean = safe_name(member.name)
                fh = tf.extractfile(member)
                entries.append((clean, fh.read() if fh else b""))
    except tarfile.TarError as exc:
        raise ApiError(415, "TAR.GZ 文件已损坏或格式不合法") from exc
    return entries


def extract(data: bytes) -> bytes:
    """ZIP / TAR.GZ 解压并重打包为 ZIP（统一交付格式）。"""
    head = data[:4]
    if is_zip(head):
        entries = _read_zip(data)
    elif is_gzip(head):
        entries = _read_tar_gz(data)
    else:
        raise ApiError(415, "仅支持 zip / tar.gz 压缩包")
    if not entries:
        raise ApiError(415, "压缩包内没有可提取的文件")
    return pack(entries)
