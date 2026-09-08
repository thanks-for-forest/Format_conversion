"use client";

import Link from "next/link";
import type { AuthUser, QuotaSummary } from "../lib/api";

// 导航条右侧登录状态（切片 12a 换装）：未登录给登录入口，已登录显示邮箱与退出。
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
  const linkStyle: React.CSSProperties = {
    color: "var(--brand)",
    fontWeight: 600,
    fontSize: 13,
  };
  const quotaText = quota
    ? `今日已用 ${quota.used.count}/${quota.limit.count} 次`
    : "";
  const textStyle: React.CSSProperties = {
    fontSize: 13,
    color: "var(--muted)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  };

  if (!user) {
    return (
      <p style={textStyle}>
        <span>{quotaText}</span>
        <Link href="/account" style={linkStyle}>
          配额
        </Link>
        <Link
          href="/login"
          style={{
            background: "var(--brand)",
            color: "#fff",
            borderRadius: "var(--r-md)",
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          登录
        </Link>
      </p>
    );
  }
  return (
    <p style={textStyle}>
      <span>{quotaText}</span>
      <Link href="/account" style={linkStyle}>
        {user.email}
      </Link>
      <button
        onClick={onLogout}
        style={{
          border: "1px solid var(--line)",
          background: "var(--card-bg)",
          color: "var(--body-color)",
          cursor: "pointer",
          padding: "6px 14px",
          fontSize: 13,
          borderRadius: "var(--r-md)",
        }}
      >
        退出
      </button>
    </p>
  );
}
