"use client";

import Link from "next/link";
import type { AuthUser, QuotaSummary } from "../lib/api";

// 首页顶部登录状态条：未登录给登录入口，已登录显示邮箱与退出。
// 配额状态由页面层持有（useQuota）并传入，保证转换后刷新一致。
export default function AuthBar({
  user,
  quota,
  onLogout,
}: {
  user: AuthUser | null;
  quota: QuotaSummary | null;
  onLogout: () => void;
}) {
  const barStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  };
  const linkStyle: React.CSSProperties = { color: "#2563eb" };
  const quotaText = quota
    ? `今日已用 ${quota.used.count}/${quota.limit.count} 次`
    : "";

  if (!user) {
    return (
      <p style={barStyle}>
        未登录 · {quotaText} ·{" "}
        <Link href="/login" style={linkStyle}>
          邮箱验证码登录
        </Link>
      </p>
    );
  }
  return (
    <p style={barStyle}>
      已登录：{user.email} · {quotaText} ·{" "}
      <button
        onClick={onLogout}
        style={{
          border: "none",
          background: "none",
          color: "#2563eb",
          cursor: "pointer",
          padding: 0,
          fontSize: 13,
        }}
      >
        退出
      </button>
    </p>
  );
}
