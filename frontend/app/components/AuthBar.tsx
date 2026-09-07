"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMe, logout, type AuthUser } from "../lib/api";

// 首页顶部登录状态条：未登录给登录入口，已登录显示邮箱与退出。
export default function AuthBar() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const barStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  };
  const linkStyle: React.CSSProperties = { color: "#2563eb" };

  if (!user) {
    return (
      <p style={barStyle}>
        未登录 ·{" "}
        <Link href="/login" style={linkStyle}>
          邮箱验证码登录
        </Link>
      </p>
    );
  }
  return (
    <p style={barStyle}>
      已登录：{user.email} ·{" "}
      <button
        onClick={() => logout().then(() => setUser(null))}
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