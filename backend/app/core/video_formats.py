"""视频格式注册表（切片 10e）：视频互转 + 提取音轨的扩展名、魔数、MIME 唯一来源。

魔数按容器特征：MP4/MOV 为 ftyp 盒（brand 不限，两容器内容互通）、
MKV/WebM 为 EBML 头、AVI 为 RIFF+AVI 。

提取音轨（视频 → mp3）的输出 MIME 复用音频注册表；转换执行复用
audio_service.convert_audio（其 -vn 参数天然只保留音轨）。
"""

from dataclasses import dataclass

# 签名结构：((偏移, 期望字节), ...) 的元组；任一签名全部命中即匹配
_Signature = tuple[tuple[int, bytes], ...]

# 魔数校验需读取的文件头长度（ftyp/RIFF+AVI 需要前 12 字节）
VIDEO_HEAD_LEN = 12


@dataclass(frozen=True)
class VideoFormat:
    """一种视频格式的注册信息。"""

    ext: str  # 规范化扩展名（不含点）
    signatures: tuple[_Signature, ...]  # 任一命中即视为该格式
    media_type: str

    def matches(self, head: bytes) -> bool:
        """判断文件头是否命中任一魔数签名。"""
        return any(
            all(head[off : off + len(sig)] == sig for off, sig in one_sig)
            for one_sig in self.signatures
        )


# MP4 与 MOV 均为 ISO-BMFT 容器（ftyp 盒），内容互通，魔数相同
_ISOBMFT = (((4, b"ftyp"),),)
# MKV 与 WebM 均为 EBML 容器
_EBML = (((0, b"\x1a\x45\xdf\xa3"),),)
_AVI = (((0, b"RIFF"), (8, b"AVI ")),)

MP4 = VideoFormat("mp4", _ISOBMFT, "video/mp4")
MOV = VideoFormat("mov", _ISOBMFT, "video/quicktime")
MKV = VideoFormat("mkv", _EBML, "video/x-matroska")
WEBM = VideoFormat("webm", _EBML, "video/webm")
AVI = VideoFormat("avi", _AVI, "video/x-msvideo")

# 输入白名单（扩展名 → 格式）
VIDEO_INPUT_FORMATS: dict[str, VideoFormat] = {
    f.ext: f for f in (MP4, MOV, MKV, WEBM, AVI)
}
# 输出白名单（互转；提取音轨的目标 mp3 走音频注册表）
VIDEO_OUTPUT_FORMATS: dict[str, VideoFormat] = {
    f.ext: f for f in (MP4, MOV, MKV, WEBM, AVI)
}
