"use client";

// 页面骨架（切片 12a 换装，借鉴 TinyPNG 版式）：白底导航条 + 浅绿 hero + 中央白色大卡。
// 登录态 + 配额（useQuota）由骨架持有并传给 AuthBar 与 Converter，保证两者展示同一份
// 配额状态。heading/below 为页面自定义内容（可序列化 JSX，服务端组件可直接传入）；
// 首页与落地页共用容器，改此一处全站生效。

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { logout } from "../lib/api";
import { useQuota } from "../lib/useQuota";
import AuthBar from "./AuthBar";
import Converter from "./Converter";

export default function SiteFrame({
  heading,
  below,
  belowCard,
  heroArt,
  lockedSource,
  lockedTarget,
}: {
  heading: ReactNode;
  below?: ReactNode;
  /** 白卡之外的全宽分段（首页产品描述等长页面内容） */
  belowCard?: ReactNode;
  /** hero 右列自定义视觉（默认展示插画图；首页传入环绕徽章舞台） */
  heroArt?: ReactNode;
  lockedSource?: string;
  lockedTarget?: string;
}) {
  const { user, setUser, quota, reloadQuota } = useQuota();

  const handleLogout = () =>
    logout().then(() => setUser(null)).finally(reloadQuota); // 退出后回到匿名档

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--line)" }}>
        <div
          style={{
            maxWidth: "var(--maxw)",
            margin: "0 auto",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "var(--brand)",
                display: "inline-block",
              }}
              aria-hidden
            />
            <strong style={{ fontSize: 16, color: "var(--ink)" }}>格式转换</strong>
          </Link>
          <AuthBar user={user} quota={quota} onLogout={handleLogout} />
        </div>
      </header>

      <section
        style={{
          background: "linear-gradient(180deg, var(--brand-soft), var(--page-bg))",
          padding: "40px 16px 64px",
        }}
      >
        {/* 左文右图分栏：文字与插画互不遮挡；窄屏 flexWrap 自动堆叠（文上图下） */}
        <div
          style={{
            maxWidth: "var(--maxw)",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 36,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 420px", textAlign: "center" }}>{heading}</div>
          <div style={{ flex: "0 1 420px", minWidth: 280 }}>
            {heroArt ?? (
              <Image
                src="/hero-bg.jpg"
                alt="文件格式转换插画：女孩在云端的笔记本前处理 PDF、视频、音频与图片文件"
                width={2848}
                height={1600}
                priority
                sizes="(max-width: 800px) 100vw, 40vw"
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--shadow-card)",
                }}
              />
            )}
          </div>
        </div>
      </section>

      <section style={{ flex: 1, padding: "0 16px 48px" }}>
        <div
          style={{
            maxWidth: "var(--maxw)",
            margin: "-28px auto 0",
            background: "var(--card-bg)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-card)",
            padding: 24,
          }}
        >
          <Converter
            quota={quota}
            reloadQuota={reloadQuota}
            lockedSource={lockedSource}
            lockedTarget={lockedTarget}
          />
          {below}
        </div>
      </section>

      {belowCard}

      <footer
        style={{
          borderTop: "1px solid var(--line)",
          background: "var(--card-bg)",
          padding: "14px 16px",
          textAlign: "center",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        文件仅在服务器临时处理，转换完成下载后立即删除 · 不用于其他用途
      </footer>
    </div>
  );
}
