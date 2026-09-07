"""配额接口测试（切片 5b）：匿名 Redis 档、登录 SQLite 档、本地计次、429 文案。"""

import io
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.core.database import get_session
from app.main import app
from app.models.quota import QuotaUsage
from app.models.user import User
from app.services import code_store


@pytest.fixture()
def client() -> TestClient:
    """每用例独立 client：避免 Cookie Jar 跨用例泄漏登录态。"""
    return TestClient(app)


def _png_bytes() -> bytes:
    """生成内存 PNG 字节（真实魔数，可通过预检）。"""
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return buf.getvalue()


def _upload(client: TestClient, **kwargs: object):
    """匿名/登录上传 PNG → JPG，返回原始响应。"""
    return client.post(
        "/api/convert",
        files={"file": ("img.png", _png_bytes(), "application/octet-stream")},
        data={"target": "jpg"},
        **kwargs,  # type: ignore[arg-type]
    )


def _login(client: TestClient, email: str) -> None:
    """验证码登录，会话 Cookie 落在 client 上。"""
    sent = client.post("/api/auth/send-code", json={"email": email})
    assert sent.status_code == 200, sent.text
    code = code_store.get_client().get(f"fc:code:{email}")
    assert code is not None
    verified = client.post("/api/auth/verify", json={"email": email, "code": str(code)})
    assert verified.status_code == 200, verified.text


def _summary(client: TestClient, **kwargs: object) -> dict:
    resp = client.get("/api/quota/summary", **kwargs)  # type: ignore[arg-type]
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_summary_anonymous_defaults(client: TestClient) -> None:
    """匿名 summary：authenticated=False、used 全 0、档位与 config 一致。"""
    data = _summary(client)
    assert data["authenticated"] is False
    assert data["used"] == {"count": 0, "traffic_bytes": 0}
    assert data["limit"]["count"] == config.ANON_DAILY_COUNT
    assert data["limit"]["max_upload_bytes"] == config.MAX_UPLOAD_BYTES
    assert "reset_at" in data


def test_anonymous_count_limit_429(client: TestClient, monkeypatch) -> None:
    """匿名次数超限：前 N 次成功，第 N+1 次 429，文案含重置时间。"""
    monkeypatch.setattr(config, "ANON_DAILY_COUNT", 2)
    assert _upload(client).status_code == 200
    assert _upload(client).status_code == 200

    third = _upload(client)
    assert third.status_code == 429
    assert "次数已达上限" in third.json()["message"]
    assert "重置" in third.json()["message"]

    data = _summary(client)
    assert data["used"]["count"] == 2
    assert data["used"]["traffic_bytes"] > 0


def test_anonymous_traffic_limit_429(client: TestClient, monkeypatch) -> None:
    """匿名流量超限：上传被 429 且不计次（预检先于扣减）。"""
    monkeypatch.setattr(config, "ANON_DAILY_TRAFFIC_BYTES", 10)
    resp = _upload(client)
    assert resp.status_code == 429
    assert "流量已达上限" in resp.json()["message"]
    assert _summary(client)["used"] == {"count": 0, "traffic_bytes": 0}


def test_rejected_request_does_not_consume(client: TestClient) -> None:
    """魔数不符 415 不消耗配额。"""
    bad = client.post(
        "/api/convert", files={"file": ("x.png", b"not-a-png", "image/png")}
    )
    assert bad.status_code == 415
    assert _summary(client)["used"]["count"] == 0


def test_user_tier_sqlite_and_limit(client: TestClient, monkeypatch) -> None:
    """登录档：SQLite 日表累计；超限 429；summary 为登录档。"""
    email = f"quota-{uuid.uuid4().hex[:8]}@example.com"
    _login(client, email)
    monkeypatch.setattr(config, "USER_DAILY_COUNT", 2)

    assert _upload(client).status_code == 200
    assert _upload(client).status_code == 200
    third = _upload(client)
    assert third.status_code == 429
    assert "次数已达上限" in third.json()["message"]

    data = _summary(client)
    assert data["authenticated"] is True
    assert data["used"]["count"] == 2
    assert data["limit"]["count"] == 2
    assert data["limit"]["max_upload_bytes"] == config.MAX_UPLOAD_BYTES_USER

    with get_session() as session:
        user = session.query(User).filter(User.email == email).first()
        assert user is not None
        row = session.query(QuotaUsage).filter(QuotaUsage.user_id == user.id).first()
    assert row is not None
    assert row.conversion_count == 2
    assert row.traffic_bytes > 0


def test_user_single_file_limit_layering(client: TestClient, monkeypatch) -> None:
    """分层单文件限额：登录档收窄后 413，匿名同文件不受影响。"""
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES_USER", 10)
    _login(client, f"big-{uuid.uuid4().hex[:8]}@example.com")

    as_user = _upload(client)
    assert as_user.status_code == 413
    assert "大小上限" in as_user.json()["message"]

    anon = _upload(TestClient(app))
    assert anon.status_code == 200


def test_user_local_count_sqlite(client: TestClient, monkeypatch) -> None:
    """登录用户本地计次走 SQLite：次数 +1、流量 0、超限 429。"""
    email = f"local-{uuid.uuid4().hex[:8]}@example.com"
    _login(client, email)
    monkeypatch.setattr(config, "USER_DAILY_COUNT", 1)

    first = client.post("/api/quota/local-count")
    assert first.status_code == 200
    assert first.json()["data"]["counted"] is True

    second = client.post("/api/quota/local-count")
    assert second.status_code == 429

    data = _summary(client)
    assert data["used"] == {"count": 1, "traffic_bytes": 0}


def test_anonymous_local_count_redis(client: TestClient, monkeypatch) -> None:
    """匿名本地计次走 Redis：只计次不计流量，超限 429。"""
    monkeypatch.setattr(config, "ANON_DAILY_COUNT", 1)
    assert client.post("/api/quota/local-count").status_code == 200
    assert client.post("/api/quota/local-count").status_code == 429
    assert _summary(client)["used"] == {"count": 1, "traffic_bytes": 0}


def test_forwarded_ip_isolation(client: TestClient) -> None:
    """X-Forwarded-For 不同 IP 配额相互隔离。"""
    headers_a = {"X-Forwarded-For": "203.0.113.9"}
    headers_b = {"X-Forwarded-For": "198.51.100.7"}

    assert _upload(client, headers=headers_a).status_code == 200
    assert _summary(client, headers=headers_a)["used"]["count"] == 1
    assert _summary(client, headers=headers_b)["used"]["count"] == 0
