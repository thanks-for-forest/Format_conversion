"""图片转换服务：切片 1 仅支持 PNG → JPG。"""

from pathlib import Path

from PIL import Image

from app.core.errors import ApiError


def png_to_jpg(in_path: Path, out_path: Path) -> Path:
    """PNG 转 JPG（白底压平透明通道，质量 85）。"""
    try:
        with Image.open(in_path) as img:
            rgb = img.convert("RGB")
            rgb.save(out_path, "JPEG", quality=85, optimize=True)
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001 对外不暴露内部错误
        raise ApiError(500, "转换失败，请重试") from exc
    return out_path
