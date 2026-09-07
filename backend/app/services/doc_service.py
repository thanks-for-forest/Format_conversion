"""文档转换服务（切片 10a）：LibreOffice 子进程转换，统一输出 PDF。

安全（ARCH §10）：
- 每任务独立 UserInstallation profile：避免多实例锁冲突；profile 预置配置
  关闭宏执行与外部链接更新（防 HTML/Office 文档在转换期外联或执行宏）；
- 子进程设硬超时，超时即按失败处理；
- 输入/输出文件名全部由 task_id 派生，不接触用户原始文件名。
"""

import shutil
import subprocess
import uuid
from pathlib import Path

from app.core import config
from app.core.doc_formats import DOC_OUTPUT_FORMATS
from app.core.errors import ApiError

# Windows 常见安装位置（winget / 官方安装器默认路径）
_WINDOWS_CANDIDATES = (
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
)

# profile 预置配置：宏禁用 + 链接永不更新（Writer / WriterWeb / Calc 三模块）
_PROFILE_XCU = "\n".join(
    (
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<oor:items xmlns:oor="http://openoffice.org/2001/registry"',
        '  xmlns:xs="http://www.w3.org/2001/XMLSchema"',
        '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        ' <item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
        '<prop oor:name="DisableMacrosExecution" oor:op="fuse">'
        "<value>true</value></prop></item>",
        ' <item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
        '<prop oor:name="MacroSecurityLevel" oor:op="fuse">'
        "<value>3</value></prop></item>",
        ' <item oor:path="/org.openoffice.Office.Writer/Content/Update">'
        '<prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>',
        ' <item oor:path="/org.openoffice.Office.WriterWeb/Content/Update">'
        '<prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>',
        ' <item oor:path="/org.openoffice.Office.Calc/Content/Update">'
        '<prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>',
        "</oor:items>",
    )
)


def find_soffice() -> str | None:
    """定位 soffice 可执行文件：SOFFICE_PATH → PATH → 常见安装位置。"""
    if config.SOFFICE_PATH:
        override = Path(config.SOFFICE_PATH)
        if override.is_file():
            return str(override)
    found = shutil.which("soffice")
    if found:
        return found
    for candidate in _WINDOWS_CANDIDATES:
        if Path(candidate).is_file():
            return candidate
    return None


def _write_profile(profile_dir: Path) -> None:
    """生成独立 UserInstallation profile 并预置安全配置。"""
    (profile_dir / "user").mkdir(parents=True, exist_ok=True)
    (profile_dir / "user" / "registrymodifications.xcu").write_text(
        _PROFILE_XCU, encoding="utf-8"
    )


def convert_document(in_path: Path, out_path: Path, target_ext: str) -> Path:
    """用 LibreOffice 把文档转为目标格式（本期 PDF）；无输出文件即视为失败。"""
    fmt = DOC_OUTPUT_FORMATS.get(target_ext)
    if fmt is None:
        raise ApiError(400, "目标格式不受支持")
    soffice = find_soffice()
    if soffice is None:
        raise ApiError(500, "服务端暂不支持文档转换，请稍后再试")

    profile = config.TMP_DIR / "profiles" / uuid.uuid4().hex
    _write_profile(profile)
    try:
        cmd = [
            soffice,
            f"-env:UserInstallation={profile.as_uri()}",
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            str(out_path.parent),
            str(in_path),
        ]
        try:
            subprocess.run(
                cmd,
                capture_output=True,
                timeout=config.SOFFICE_TIMEOUT_SEC,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ApiError(500, "转换超时，请重试") from exc
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    # soffice 对损坏文档可能退出码 0 但不产出文件，必须核对输出存在
    if not out_path.is_file():
        raise ApiError(500, "转换失败，请重试")
    return out_path
