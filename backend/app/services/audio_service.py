"""音频转换服务（切片 10b）：ffmpeg 子进程互转。

安全（ARCH §10）：
- 子进程设硬超时，超时即按失败处理；-nostdin 防止 ffmpeg 等待交互输入；
- 输入/输出文件名全部由 task_id 派生，不接触用户原始文件名；
- -vn 丢弃封面/视频流，只转换音频轨。
"""

import shutil
import subprocess
from pathlib import Path

from app.core import config
from app.core.audio_formats import AUDIO_OUTPUT_FORMATS
from app.core.errors import ApiError

# Windows 常见位置：winget portable 包的 Links shim 与手动解压目录
_WINDOWS_CANDIDATES = (r"C:\ffmpeg\bin\ffmpeg.exe",)

# 各目标格式的编码参数（-c:a 及码率/质量）
_ENCODER_ARGS: dict[str, list[str]] = {
    "mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
    "wav": ["-c:a", "pcm_s16le"],
    "flac": ["-c:a", "flac"],
    "aac": ["-c:a", "aac", "-b:a", "192k"],
    "m4a": ["-c:a", "aac", "-b:a", "192k"],
    "ogg": ["-c:a", "libvorbis", "-q:a", "4"],
}


def find_ffmpeg() -> str | None:
    """定位 ffmpeg：FFMPEG_PATH → PATH → winget portable 包 → 常见安装位置。"""
    if config.FFMPEG_PATH:
        override = Path(config.FFMPEG_PATH)
        if override.is_file():
            return str(override)
    found = shutil.which("ffmpeg")
    if found:
        return found
    # winget portable 包：版本号目录不定，按包 id 前缀 glob（如 Gyan.FFmpeg）
    packages = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if packages.is_dir():
        for hit in sorted(packages.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe")):
            return str(hit)
    links = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Links"
    winget_shim = links / "ffmpeg.exe"
    if winget_shim.is_file():
        return str(winget_shim)
    for candidate in _WINDOWS_CANDIDATES:
        if Path(candidate).is_file():
            return candidate
    return None


def convert_audio(in_path: Path, out_path: Path, target_ext: str) -> Path:
    """用 ffmpeg 把音频转为目标格式；无输出文件即视为失败。"""
    fmt = AUDIO_OUTPUT_FORMATS.get(target_ext)
    if fmt is None:
        raise ApiError(400, "目标格式不受支持")
    encoder_args = _ENCODER_ARGS.get(target_ext)
    if encoder_args is None:
        raise ApiError(400, "目标格式不受支持")
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        raise ApiError(500, "服务端暂不支持音频转换，请稍后再试")

    cmd = [
        ffmpeg,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(in_path),
        "-vn",
        *encoder_args,
        str(out_path),
    ]
    try:
        subprocess.run(
            cmd,
            capture_output=True,
            timeout=config.FFMPEG_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ApiError(500, "转换超时，请重试") from exc
    # ffmpeg 对损坏文件可能退出码 0 但不产出文件，必须核对输出存在
    if not out_path.is_file():
        raise ApiError(500, "转换失败，请重试")
    return out_path
