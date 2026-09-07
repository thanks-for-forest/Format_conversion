"""音频格式注册表（切片 10b）：音频互转的扩展名、魔数、MIME 唯一来源。

与文档注册表（core/doc_formats.py）同构：Office 式二进制魔数核对文件头。
音频魔数按容器/流特征：ID3 标签或 MPEG 帧同步、RIFF+WAVE、fLaC、OggS、
ftyp 盒（M4A/MP4 家族）、ADTS 同步字（裸 AAC 流）。
"""

from dataclasses import dataclass

# 签名结构：((偏移, 期望字节), ...) 的元组；任一签名全部命中即匹配
_Signature = tuple[tuple[int, bytes], ...]

# 魔数校验需读取的文件头长度（RIFF+WAVE 需要偏移 8 处 4 字节）
AUDIO_HEAD_LEN = 12


@dataclass(frozen=True)
class AudioFormat:
    """一种音频格式的注册信息。"""

    ext: str  # 规范化扩展名（不含点）
    signatures: tuple[_Signature, ...]  # 任一命中即视为该格式
    media_type: str

    def matches(self, head: bytes) -> bool:
        """判断文件头是否命中任一魔数签名。"""
        return any(
            all(head[off : off + len(sig)] == sig for off, sig in one_sig)
            for one_sig in self.signatures
        )


# MP3：ID3v2 标签或 MPEG 音频帧同步字（0xFFEx / 0xFFFx 常见版本）
_MP3 = (
    ((0, b"ID3"),),
    ((0, b"\xff\xfb"),),
    ((0, b"\xff\xf3"),),
    ((0, b"\xff\xf2"),),
)
_WAV = (((0, b"RIFF"), (8, b"WAVE")),)
_FLAC = (((0, b"fLaC"),),)
_OGG = (((0, b"OggS"),),)
# M4A：MP4 家族 ftyp 盒（brand 不限，兼容 M4A / isom 等写法）
_M4A = (((4, b"ftyp"),),)
# 裸 AAC：ADTS 流同步字（MPEG-4 / MPEG-2）
_AAC = (
    ((0, b"\xff\xf1"),),
    ((0, b"\xff\xf9"),),
)

MP3 = AudioFormat("mp3", _MP3, "audio/mpeg")
WAV = AudioFormat("wav", _WAV, "audio/wav")
FLAC = AudioFormat("flac", _FLAC, "audio/flac")
AAC = AudioFormat("aac", _AAC, "audio/aac")
OGG = AudioFormat("ogg", _OGG, "audio/ogg")
M4A = AudioFormat("m4a", _M4A, "audio/mp4")

# 输入白名单（扩展名 → 格式）
AUDIO_INPUT_FORMATS: dict[str, AudioFormat] = {
    f.ext: f for f in (MP3, WAV, FLAC, AAC, OGG, M4A)
}
# 输出白名单（互转，同格式由前端/上游排除）
AUDIO_OUTPUT_FORMATS: dict[str, AudioFormat] = {
    f.ext: f for f in (MP3, WAV, FLAC, AAC, OGG, M4A)
}
