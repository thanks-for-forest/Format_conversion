"use client";

// 账户与配额页：展示当前身份（邮箱/匿名）、今日次数与流量用量、
// 单文件上限、重置时刻（UTC → 本地时区）；未登录给登录引导。

import Link from "next/link";
import { useEffect, useState } from "react";
import { logout, type QuotaSummary } from "../lib/api";
import { useQuota } from "../lib/useQuota";

function mb(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function pct(used: number, limit: number): string {
  return `${Math.min(100, Math.round((used / limit) * 100))}%`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--line)",
        fontSize: 14,
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ color: "var(--ink)" }}>{children}</span>
    </div>
  );
}

function Bar({ used, limit }: { used: number; limit: number }) {
  const ratio = Math.min(1, used / limit);
  return (
    <div style={{ height: 6, background: "var(--page-bg)", borderRadius: 3, marginTop: 6 }}>
      <div
        style={{
          width: pct(used, limit),
          height: "100%",
          borderRadius: 3,
          background: ratio >= 1 ? "var(--danger)" : "var(--brand)",
        }}
      />
    </div>
  );
}

function UsageRow({
  label,
  usedText,
  used,
  limit,
}: {
  label: string;
  usedText: string;
  used: number;
  limit: number;
}) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ color: "var(--ink)" }}>{usedText}</span>
      </div>
      <Bar used={used} limit={limit} />
    </div>
  );
}

function QuotaPanel({ quota }: { quota: QuotaSummary }) {
  // reset_at 为 UTC ISO 字符串，转本地时区展示
  const resetLocal = new Date(quota.reset_at).toLocaleString();
  return (
    <div style={{ marginTop: 16 }}>
      <UsageRow
        label="今日转换次数"
        usedText={`${quota.used.count} / ${quota.limit.count} 次`}
        used={quota.used.count}
        limit={quota.limit.count}
      />
      <UsageRow
        label="今日服务端流量"
        usedText={`${mb(quota.used.traffic_bytes)} / ${mb(quota.limit.traffic_bytes)}`}
        used={quota.used.traffic_bytes}
        limit={quota.limit.traffic_bytes}
      />
      <Row label="单文件大小上限">{mb(quota.limit.max_upload_bytes)}</Row>
      <Row label="本地转换">计次数、不计流量</Row>
      <Row label="配额重置时间">{resetLocal}（每日 UTC 零点）</Row>
    </div>
  );
}

export default function AccountPage() {
  const { user, setUser, quota, reloadQuota } = useQuota();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 400); // 等会话探测完成，避免闪烁
    return () => clearTimeout(t);
  }, []);

  const handleLogout = () =>
    logout().then(() => setUser(null)).finally(reloadQuota);

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "48px auto",
        padding: 32,
        background: "var(--card-bg)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        fontFamily: "var(--font)",
      }}
    >
      <h1 style={{ fontSize: 28, margin: 0, color: "var(--ink)" }}>我的账户</h1>

      {!ready ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : user ? (
        <>
          <p style={{ color: "var(--body-color)" }}>
            登录邮箱：<strong>{user.email}</strong>
          </p>
          {quota && <QuotaPanel quota={quota} />}
          <p style={{ marginTop: 20 }}>
            <Link href="/" style={{ color: "var(--brand)", fontWeight: 600 }}>
              返回转换
            </Link>
            <span style={{ margin: "0 8px", color: "var(--line)" }}>|</span>
            <button
              onClick={handleLogout}
              style={{
                border: "none",
                background: "none",
                color: "var(--brand)",
                cursor: "pointer",
                padding: 0,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              退出登录
            </button>
          </p>
        </>
      ) : (
        <>
          <p style={{ color: "var(--body-color)" }}>
            你当前以匿名身份使用，配额较低（每日 5 次、单文件 50MB）。
          </p>
          {quota && <QuotaPanel quota={quota} />}
          <p style={{ marginTop: 20 }}>
            <Link href="/login" style={{ color: "var(--brand)", fontWeight: 600 }}>
              邮箱验证码登录
            </Link>
            <span style={{ margin: "0 8px", color: "var(--line)" }}>|</span>
            <Link href="/" style={{ color: "var(--brand)", fontWeight: 600 }}>
              返回转换
            </Link>
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            登录后每日 50 次、单文件 200MB、服务端流量 2GB。
          </p>
        </>
      )}
    </main>
  );
}
