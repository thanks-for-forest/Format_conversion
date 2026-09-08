"""Office 预览测试（切片 11a）：docx → PDF 端到端 + 越界/伪装/限流拒绝。

真实转换用例依赖 LibreOffice（soffice）：本机未安装时自动跳过；
CI 的 backend job 安装 libreoffice-writer/calc/impress 后执行。
"""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.main import app
from app.services.doc_service import find_soffice

client = TestClient(app)

_HAS_SOFFICE = find_soffice() is not None
_needs_soffice = pytest.mark.skipif(
    not _HAS_SOFFICE, reason="本机未安装 LibreOffice（soffice 不可用）"
)


def _docx_bytes(text: str = "预览测试") -> bytes:
    """手工打包最小可用 docx（zip 容器 + OOXML 最小三件套）。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType='
            '"application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType='
            '"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type='
            '"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
            ' Target="word/document.xml"/></Relationships>',
        )
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


def _preview(name: str, content: bytes):
    return client.post(
        "/api/preview/office",
        files={"file": (name, content)},
    )


@_needs_soffice
def test_preview_docx_returns_pdf():
    """合法 docx → 200 且响应体为 PDF（%PDF- 魔数）。"""
    resp = _preview("hello.docx", _docx_bytes())
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    assert resp.headers["content-type"] == "application/pdf"


def test_preview_text_ext_rejected():
    """文本类扩展名（txt）不经服务端预览 → 415。"""
    resp = _preview("note.txt", "纯文本内容".encode())
    assert resp.status_code == 415


def test_preview_bad_magic_rejected():
    """docx 扩展名 + 非 zip 内容 → 415（魔数校验）。"""
    resp = _preview("fake.docx", b"MZ not a zip at all.......")
    assert resp.status_code == 415


def test_preview_no_ext_rejected():
    """无扩展名文件 → 415。"""
    resp = _preview("file", _docx_bytes())
    assert resp.status_code == 415


def test_preview_too_large_rejected(monkeypatch: pytest.MonkeyPatch):
    """超过单文件上限 → 413。"""
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    resp = _preview("big.docx", _docx_bytes())
    assert resp.status_code == 413


def test_preview_rate_limited(monkeypatch: pytest.MonkeyPatch):
    """每日每 IP 预览计数超限 → 429（独立于转换配额）。"""
    monkeypatch.setattr(config, "PREVIEW_DAILY_COUNT", 0)
    resp = _preview("hello.docx", _docx_bytes())
    assert resp.status_code == 429
