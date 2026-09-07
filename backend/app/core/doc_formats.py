"""文档格式注册表（切片 10a）：文档 → PDF 的扩展名、魔数、MIME 唯一来源。

与图片注册表（core/formats.py）同构但校验语义不同：
- Office 二进制格式按魔数签名核对文件头（OOXML/ODF 为 zip 容器，OLE2 为旧格式）；
- 纯文本格式（txt/csv/html）无魔数，改为弱校验：UTF-8 可解码且文件头无 NUL 字节
  （防二进制伪装扩展名；真正的格式合法性交给 LibreOffice 解析，解析失败即任务失败）。
"""

from dataclasses import dataclass

# 签名结构：((偏移, 期望字节), ...) 的元组；任一签名全部命中即匹配
_Signature = tuple[tuple[int, bytes], ...]

# 魔数校验需读取的文件头长度（OLE2 签名 8 字节）
DOC_HEAD_LEN = 12


def _decodable_utf8(head: bytes) -> bool:
    """文件头可按 UTF-8 解码（允许尾部多字节字符被截断）且无 NUL 字节。"""
    if b"\x00" in head:
        return False
    for trim in range(4):
        try:
            head[: len(head) - trim if trim else None].decode("utf-8")
            return True
        except UnicodeDecodeError:
            continue
    return False


@dataclass(frozen=True)
class DocFormat:
    """一种文档格式的注册信息。"""

    ext: str  # 规范化扩展名（不含点）
    signatures: tuple[_Signature, ...] | None  # None 表示纯文本格式
    media_type: str

    def matches(self, head: bytes) -> bool:
        """判断文件头是否通过该格式的校验。"""
        if self.signatures is None:
            return _decodable_utf8(head)
        return any(
            all(head[off : off + len(sig)] == sig for off, sig in one_sig)
            for one_sig in self.signatures
        )


# 共享容器签名：OOXML（docx/xlsx/pptx）与 ODF（odt/ods/odp）均为 zip 包
_ZIP = (((0, b"PK\x03\x04"),),)
# 旧版 Office 二进制容器
_OLE2 = (((0, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),),)

# OOXML MIME（超长，提前定义避免行超限）
_MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_MIME_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

DOC = DocFormat("doc", _OLE2, "application/msword")
DOCX = DocFormat("docx", _ZIP, _MIME_DOCX)
XLS = DocFormat("xls", _OLE2, "application/vnd.ms-excel")
XLSX = DocFormat("xlsx", _ZIP, _MIME_XLSX)
PPT = DocFormat("ppt", _OLE2, "application/vnd.ms-powerpoint")
PPTX = DocFormat("pptx", _ZIP, _MIME_PPTX)
ODT = DocFormat("odt", _ZIP, "application/vnd.oasis.opendocument.text")
ODS = DocFormat("ods", _ZIP, "application/vnd.oasis.opendocument.spreadsheet")
ODP = DocFormat("odp", _ZIP, "application/vnd.oasis.opendocument.presentation")
HTML = DocFormat("html", None, "text/html")
CSV = DocFormat("csv", None, "text/csv")
TXT = DocFormat("txt", None, "text/plain")

# 输入白名单（扩展名 → 格式）；md 为前端本地渲染（md→html），不经服务端
DOC_INPUT_FORMATS: dict[str, DocFormat] = {
    f.ext: f for f in (DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, HTML, CSV, TXT)
}

PDF = DocFormat("pdf", (((0, b"%PDF-"),),), "application/pdf")
# 输出白名单（本期仅 PDF）
DOC_OUTPUT_FORMATS: dict[str, DocFormat] = {"pdf": PDF}


def output_media_type(ext: str) -> str:
    """按扩展名取文档输出 MIME；未知回退通用二进制流。"""
    fmt = DOC_OUTPUT_FORMATS.get(ext)
    return fmt.media_type if fmt else "application/octet-stream"
