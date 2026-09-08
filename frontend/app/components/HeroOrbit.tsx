"use client";

// hero 环绕舞台（切片 12h）：格式徽章沿椭圆轨道均匀环绕中央插画，
// 呼应插画自身「文件图标环绕女孩」的构图。徽章位置按角度三角函数算出
// 百分比坐标（响应式缩放），浮动动画错峰（globals.css 的 hero-float）。

import Image from "next/image";

const FORMATS = [
  "PNG",
  "JPG",
  "WEBP",
  "BMP",
  "PDF",
  "DOCX",
  "XLSX",
  "PPTX",
  "MP4",
  "MP3",
  "MKV",
  "ZIP",
] as const;

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "var(--body-color)",
  background: "var(--card-bg)",
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "4px 12px",
  boxShadow: "var(--shadow-card)",
  whiteSpace: "nowrap",
  animation: "hero-float 5s ease-in-out infinite",
};

export default function HeroOrbit() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "10 / 9",
      }}
    >
      {/* 中央插画（cover 聚焦主体：女孩 + 云 + 文件图标） */}
      <div
        style={{
          position: "absolute",
          inset: "16% 17%",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <Image
          src="/hero-bg.jpg"
          alt="文件格式转换插画：女孩在云端的笔记本前处理 PDF、视频、音频与图片文件"
          fill
          priority
          sizes="(max-width: 800px) 90vw, 420px"
          style={{ objectFit: "cover" }}
        />
      </div>
      {/* 格式徽章：椭圆轨道均分（从顶部起顺时针），错峰浮动 */}
      {FORMATS.map((f, i) => {
        const angle = (i / FORMATS.length) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + 47 * Math.cos(angle);
        const y = 50 + 45 * Math.sin(angle);
        return (
          <span
            key={f}
            className="hero-orbit-badge"
            style={{
              ...badgeStyle,
              left: `${x}%`,
              top: `${y}%`,
              animationDelay: `${i * 0.3}s`,
            }}
          >
            {f}
          </span>
        );
      })}
    </div>
  );
}
