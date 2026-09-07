"""安全加固测试（2026-09-07 审计修复）：XFF 伪造 / IP 发码限流。"""

from fastapi.testclient import TestClient

from app.main import app

REAL_PROXY_IP = "10.0.0.9"  # 模拟 Caddy 追加的真实客户端位置


def test_spoofed_xff_cannot_reset_quota() -> None:
    """审计 H1：伪造 XFF 首段不得重置匿名配额（取最后一跳）。"""
    client = TestClient(app)
    for spoof in ("1.2.3.4", "5.6.7.8", "9.9.9.9"):
        client.post(
            "/api/quota/local-count",
            headers={"X-Forwarded-For": f"{spoof}, {REAL_PROXY_IP}"},
        )
    summary = client.get(
        "/api/quota/summary",
        headers={"X-Forwarded-For": f"1.1.1.1, {REAL_PROXY_IP}"},
    ).json()["data"]
    assert summary["used"]["count"] == 3  # 三个伪造首段仍累计在同一 IP 桶


def test_send_code_ip_hourly_limit() -> None:
    """审计 M1：同 IP 换邮箱刷码受小时限流（默认 10 次/小时）。"""
    client = TestClient(app)
    headers = {"X-Forwarded-For": f"203.0.113.7, {REAL_PROXY_IP}"}
    for i in range(10):
        resp = client.post(
            "/api/auth/send-code",
            json={"email": f"user{i}@example.com"},
            headers=headers,
        )
        assert resp.status_code == 200
    blocked = client.post(
        "/api/auth/send-code",
        json={"email": "user11@example.com"},
        headers=headers,
    )
    assert blocked.status_code == 429
    # 换真实 IP（XFF 最后一跳）不受影响（各 IP 独立限流桶）
    other = client.post(
        "/api/auth/send-code",
        json={"email": "other@example.com"},
        headers={"X-Forwarded-For": "203.0.113.7, 10.0.0.10"},
    )
    assert other.status_code == 200
