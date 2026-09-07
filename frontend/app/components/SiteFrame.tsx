"use client";

// 页面骨架：登录态 + 配额（useQuota）由骨架持有并传给 AuthBar 与 Converter，
// 保证两者展示同一份配额状态。heading/below 为页面自定义内容（可序列化 JSX，
// 服务端组件可直接传入）；首页与落地页共用容器样式。

import type { ReactNode } from "react";
import { logout } from "../lib/api";
import { useQuota } from "../lib/useQuota";
import AuthBar from "./AuthBar";
import Converter from "./Converter";

export default function SiteFrame({
  heading,
  below,
  lockedSource,
  lockedTarget,
}: {
  heading: ReactNode;
  below?: ReactNode;
  lockedSource?: string;
  lockedTarget?: string;
}) {
  const { user, setUser, quota, reloadQuota } = useQuota();

  const handleLogout = () =>
    logout().then(() => setUser(null)).finally(reloadQuota); // 退出后回到匿名档

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "80px auto",
        padding: 32,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        fontFamily: "sans-serif",
      }}
    >
      <AuthBar user={user} quota={quota} onLogout={handleLogout} />
      {heading}
      <Converter
        quota={quota}
        reloadQuota={reloadQuota}
        lockedSource={lockedSource}
        lockedTarget={lockedTarget}
      />
      {below}
    </main>
  );
}
