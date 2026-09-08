"""文档转换测试（切片 10a）：文档 → PDF 端到端 + 伪装/越界拒绝。

真实转换用例依赖 LibreOffice（soffice）：本机未安装时自动跳过；
CI 的 backend job 安装 libreoffice-writer/calc/impress 后执行。
"""

import io
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.core.doc_formats import DOC_HEAD_LEN, DOC_OUTPUT_FORMATS
from app.main import app
from app.services.doc_service import find_soffice

client = TestClient(app)

_HAS_SOFFICE = find_soffice() is not None
_needs_soffice = pytest.mark.skipif(
    not _HAS_SOFFICE, reason="本机未安装 LibreOffice（soffice 不可用）"
)


def _wait_done(task_id: str, pass_key: str, timeout: float = 30.0) -> dict:
    """轮询任务直到终态（创建响应恒为 queued，eager 也在其之前跑完）。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        info = client.get(f"/api/tasks/{task_id}", params={"pass_key": pass_key})
        data = info.json()["data"]
        if data["status"] in ("succeeded", "failed"):
            return data
        time.sleep(0.05)
    raise AssertionError("任务未在时限内完成")


def _docx_bytes(text: str = "你好，格式转换") -> bytes:
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
            '"http://schemas.openxmlformats.org/officeDocument/2006/'
            'relationships/officeDocument" '
            'Target="word/document.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


def _upload_doc(name: str, content: bytes, target: str = "pdf"):
    """上传文档类文件到 /api/convert。"""
    return client.post(
        "/api/convert",
        files={"file": (name, content, "application/octet-stream")},
        data={"target": target},
    )


@_needs_soffice
def test_docx_to_pdf_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """docx 上传 → eager 转换 → 下载 PDF（%PDF 魔数），下载即删。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    resp = _upload_doc("hello.docx", _docx_bytes())
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info
    assert info["out_size"] and info["out_size"] > 0

    dl = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl.status_code == 200
    assert DOC_OUTPUT_FORMATS["pdf"].matches(dl.content[:DOC_HEAD_LEN])
    assert dl.headers["content-disposition"].endswith('.pdf"')
    assert dl.headers["content-type"].startswith("application/pdf")

    # 下载即删：二次下载 404
    dl2 = client.get(
        f"/api/tasks/{data['task_id']}/download", params={"pass_key": data["pass_key"]}
    )
    assert dl2.status_code == 404


@_needs_soffice
def test_txt_to_pdf_e2e(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """纯文本（UTF-8）→ PDF 走通，验证文本格式弱校验分支。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    resp = _upload_doc("notes.txt", "第一行\nsecond line\n".encode())
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "succeeded", info


@_needs_soffice
def test_corrupt_office_file_fails_task(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """魔数合法但内容损坏的 docx：任务 failed 且带可读错误（非 415）。"""
    monkeypatch.setattr(config, "TMP_DIR", tmp_path)
    # zip 头合法但内容截断，LibreOffice 解析失败 → 任务失败
    resp = _upload_doc("broken.docx", b"PK\x03\x04" + b"\x00" * 64)
    assert resp.status_code == 200
    data = resp.json()["data"]
    info = _wait_done(data["task_id"], data["pass_key"])
    assert info["status"] == "failed"
    assert info["message"]


def test_doc_rejects_binary_disguise() -> None:
    """二进制（PE 头）伪装 .docx 扩展名：415 拒绝。"""
    resp = _upload_doc("evil.docx", b"MZ\x90\x00\x03\x00\x00\x00")
    assert resp.status_code == 415
    assert "UTF-8" not in resp.json()["message"]  # 走魔数分支而非文本分支文案


def test_doc_rejects_non_utf8_text() -> None:
    """GBK 编码文本冒充 .txt：415 拒绝（本期仅接受 UTF-8）。"""
    gbk_bytes = "中文内容".encode("gb18030")
    assert b"\x00" not in gbk_bytes  # 确认是被编码分支而非 NUL 拦截
    resp = _upload_doc("gbk.txt", gbk_bytes)
    assert resp.status_code == 415
    assert "UTF-8" in resp.json()["message"]


def test_doc_rejects_unknown_ext_and_target() -> None:
    """文档分支：非白名单源扩展名 415；目标不支持（docx 作目标）400。"""
    rtf = _upload_doc("x.rtf", b"{\\rtf1 hello}")
    assert rtf.status_code == 415

    not_output = _upload_doc("x.txt", b"hello", target="docx")
    assert not_output.status_code == 400


def test_image_target_pdf_rejected_for_image_source() -> None:
    """图片源请求转 PDF：目标不属于图片输出白名单，400（源支持、目标不支持）。"""
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    resp = _upload_doc("img.png", buf.getvalue())
    assert resp.status_code == 400
