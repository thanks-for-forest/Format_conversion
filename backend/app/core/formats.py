"""图片格式注册表：扩展名、魔数、Pillow 格式名、MIME 的唯一来源。

扩展名 + 魔数双重校验（ARCH §10）：先按扩展名白名单定位格式，
再用该格式的魔数签名核对文件头，任一不符即拒绝。
"""

from dataclasses import dataclass

# 魔数校验需读取的文件头长度（取各格式最大需求：WebP 在偏移 8 处还有 4 字节）
HEAD_LEN = 12

# 签名结构：((偏移, 期望字节), ...) 的元组；任一签名全部命中即匹配
_Signature = tuple[tuple[int, bytes], ...]


@dataclass(frozen=True)
class ImageFormat:
    """一种图片格式的注册信息。"""

    ext: str  # 规范化扩展名（不含点）
    signatures: tuple[_Signature, ...]  # 任一命中即视为该格式
    pil_name: str  # Pillow 保存/识别用的格式名
    media_type: str
    output: bool  # 是否支持作为输出格式

    def matches(self, head: bytes) -> bool:
        """判断文件头是否命中任一魔数签名。"""
        return any(
            all(head[off : off + len(sig)] == sig for off, sig in one_sig)
            for one_sig in self.signatures
        )


PNG = ImageFormat(
    "png",
    (((0, b"\x89PNG\r\n\x1a\n"),),),
    "PNG",
    "image/png",
    True,
)
JPG = ImageFormat(
    "jpg",
    (((0, b"\xff\xd8\xff"),),),
    "JPEG",
    "image/jpeg",
    True,
)
WEBP = ImageFormat(
    "webp",
    (((0, b"RIFF"), (8, b"WEBP")),),
    "WEBP",
    "image/webp",
    True,
)
BMP = ImageFormat(
    "bmp",
    (((0, b"BM"),),),
    "BMP",
    "image/bmp",
    False,
)
GIF = ImageFormat(
    "gif",
    (((0, b"GIF87a"),), ((0, b"GIF89a"),)),
    "GIF",
    "image/gif",
    False,
)

# 输入白名单（扩展名 → 格式）
INPUT_FORMATS: dict[str, ImageFormat] = {f.ext: f for f in (PNG, JPG, WEBP, BMP, GIF)}
# 输出白名单
OUTPUT_FORMATS: dict[str, ImageFormat] = {f.ext: f for f in (PNG, JPG, WEBP)}

# 常见别名归一化
_EXT_ALIASES = {"jpeg": "jpg"}


def normalize_ext(ext: str) -> str:
    """归一化裸扩展名（可带点）：小写 + 别名折叠；空返回空串。"""
    ext = ext.lower().strip(".")
    if not ext:
        return ""
    return _EXT_ALIASES.get(ext, ext)


def ext_of_filename(filename: str) -> str:
    """从文件名提取扩展名并归一化；无点/无扩展名返回空串。"""
    parts = filename.lower().rsplit(".", 1)
    if len(parts) != 2 or not parts[1]:
        return ""
    return normalize_ext(parts[1])


def media_type_of(ext: str) -> str:
    """按扩展名取 MIME；未知格式回退通用二进制流。"""
    fmt = OUTPUT_FORMATS.get(ext) or INPUT_FORMATS.get(ext)
    return fmt.media_type if fmt else "application/octet-stream"
