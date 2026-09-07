"""图片转换服务（切片 4a：表驱动多格式互转）。"""

from pathlib import Path

from PIL import Image

from app.core.errors import ApiError
from app.core.formats import OUTPUT_FORMATS


def convert_image(in_path: Path, out_path: Path, target_ext: str) -> Path:
    """按输出白名单转换图片；JPG 压平透明通道（白底），WebP/PNG 保留 Alpha。"""
    fmt = OUTPUT_FORMATS.get(target_ext)
    if fmt is None:
        raise ApiError(400, "目标格式不受支持")
    try:
        with Image.open(in_path) as img:
            if fmt.ext == "jpg":
                img.convert("RGB").save(
                    out_path, fmt.pil_name, quality=85, optimize=True
                )
            elif fmt.ext == "webp":
                img.save(out_path, fmt.pil_name, quality=85)
            else:
                img.save(out_path, fmt.pil_name)
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001 对外不暴露内部错误
        raise ApiError(500, "转换失败，请重试") from exc
    return out_path
