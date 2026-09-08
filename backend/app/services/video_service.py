"""视频转换服务（切片 10e）：ffmpeg 子进程互转（提取音轨走 audio_service）。

安全（ARCH §10）：与 audio_service 同口径——-nostdin 防交互挂起、
子进程硬超时、文件名由 task_id 派生、输出存在为成功判据。

编码取舍（免费站口径）：x264 用 veryfast + crf 28（速度优先），
WebM 用 VP8（libvpx，VP9 质量更高但转码慢一个量级），AVI 用 mpeg4 兼容老播放器。
"""

import subprocess
from pathlib import Path

from app.core import config
from app.core.errors import ApiError
from app.core.video_formats import VIDEO_OUTPUT_FORMATS
from app.services.audio_service import find_ffmpeg

# 各目标格式的编码参数（视频流 + 音频流）
_ENCODER_ARGS: dict[str, list[str]] = {
    "mp4": [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
    ],
    "mov": [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
    ],
    "mkv": [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
    ],
    "webm": ["-c:v", "libvpx", "-b:v", "1M", "-c:a", "libvorbis"],
    "avi": ["-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame", "-q:a", "3"],
}


def convert_video(in_path: Path, out_path: Path, target_ext: str) -> Path:
    """用 ffmpeg 把视频转为目标格式；无输出文件即视为失败。"""
    fmt = VIDEO_OUTPUT_FORMATS.get(target_ext)
    encoder_args = _ENCODER_ARGS.get(target_ext)
    if fmt is None or encoder_args is None:
        raise ApiError(400, "目标格式不受支持")
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        raise ApiError(500, "服务端暂不支持视频转换，请稍后再试")

    cmd = [
        ffmpeg,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(in_path),
        *encoder_args,
        str(out_path),
    ]
    try:
        subprocess.run(
            cmd,
            capture_output=True,
            timeout=config.VIDEO_FFMPEG_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ApiError(500, "转换超时，请重试") from exc
    # ffmpeg 对损坏文件可能退出码 0 但不产出文件，必须核对输出存在
    if not out_path.is_file():
        raise ApiError(500, "转换失败，请重试")
    return out_path
