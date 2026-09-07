"""认证接口测试：发码/验码/会话/刷新/登出（依赖 Redis，conftest 已隔离）。"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import code_store

EMAIL = "user@example.com"


@pytest.fixture()
def client() -> TestClient:
    """每用例独立 client：避免 Cookie Jar 跨用例泄漏登录态。"""
    return TestClient(app)


def _send_code(client: TestClient) -> None:
    resp = client.post("/api/auth/send-code", json={"email": EMAIL})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sent"] is True


def _read_code() -> str:
    """开发假发送：从 Redis 直接取验证码（模拟用户读邮件）。"""
    code = code_store.get_client().get(f"fc:code:{EMAIL}")
    assert code is not None, "验证码未写入 Redis"
    return str(code)


def test_send_code_and_verify_full_session(client: TestClient) -> None:
    """发码 → 验码 → 双 Cookie 会话 → me → logout。"""
    _send_code(client)
    resp = client.post("/api/auth/verify", json={"email": EMAIL, "code": _read_code()})
    assert resp.status_code == 200
    body = resp.json()["data"]["user"]
    assert body["email"] == EMAIL

    assert resp.cookies.get("access_token") and resp.cookies.get("refresh_token")

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["data"]["user"]["email"] == EMAIL

    out = client.post("/api/auth/logout")
    assert out.status_code == 200
    anon = client.get("/api/auth/me")
    assert anon.status_code == 401


def test_verify_wrong_code_then_correct(client: TestClient) -> None:
    """错误验证码拒绝；同一验证码在尝试上限内仍可验通。"""
    _send_code(client)
    code = _read_code()
    wrong = client.post("/api/auth/verify", json={"email": EMAIL, "code": "000000"})
    assert wrong.status_code == 400

    ok = client.post("/api/auth/verify", json={"email": EMAIL, "code": code})
    assert ok.status_code == 200


def test_verify_attempt_limit_kills_code(client: TestClient) -> None:
    """连续错 5 次后验证码作废，正确码也拒绝（防爆破）。"""
    _send_code(client)
    code = _read_code()
    for _ in range(5):
        client.post("/api/auth/verify", json={"email": EMAIL, "code": "111111"})
    dead = client.post("/api/auth/verify", json={"email": EMAIL, "code": code})
    assert dead.status_code == 400


def test_send_code_cooldown(client: TestClient) -> None:
    """冷却期内重复发送 → 429。"""
    _send_code(client)
    again = client.post("/api/auth/send-code", json={"email": EMAIL})
    assert again.status_code == 429


def test_send_code_invalid_email(client: TestClient) -> None:
    """非邮箱格式 → 400（统一信封参数校验）。"""
    resp = client.post("/api/auth/send-code", json={"email": "not-an-email"})
    assert resp.status_code == 400
    assert resp.json()["message"] == "请求参数无效"


def test_me_unauthorized_and_refresh(client: TestClient) -> None:
    """无 Cookie me → 401；refresh 轮换出可用会话。"""
    anon = client.get("/api/auth/me")
    assert anon.status_code == 401

    _send_code(client)
    login = client.post("/api/auth/verify", json={"email": EMAIL, "code": _read_code()})
    refresh_cookie = login.cookies.get("refresh_token")
    assert refresh_cookie

    refreshed = client.post(
        "/api/auth/refresh", cookies={"refresh_token": refresh_cookie}
    )
    assert refreshed.status_code == 200
    assert refreshed.cookies.get("access_token")

    me = client.get("/api/auth/me", cookies=refreshed.cookies)
    assert me.status_code == 200
    assert me.json()["data"]["user"]["email"] == EMAIL


def test_me_with_bad_token(client: TestClient) -> None:
    """伪造/损坏 token → 401。"""
    resp = client.get("/api/auth/me", cookies={"access_token": "forged.token.value"})
    assert resp.status_code == 401
