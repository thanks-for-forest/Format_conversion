"use client";

// hero 环绕舞台（切片 12i）：格式徽章沿椭圆轨道**持续公转**——
// 轨道层 .orbit-spin 顺时针旋转，每枚徽章 .orbit-counter 反向自转抵消（文字保持水平），
// 两动画严格同步（时长一致、delay 均为 0）。徽章的椭圆位置由 wrapper 的百分比定位给出，
// 旋转带动 wrapper 绕容器中心公转。reduced-motion 下全部静止（徽章仍分布在椭圆上）。

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
  display: "inline-block",
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
};

export default function HeroOrbit() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1", // 正方容器保证百分比半径在 x/y 像素相等 → 轨迹为正圆
      }}
    >
      {/* 中央插画（不参与旋转；cover 聚焦主体：女孩 + 云 + 文件图标） */}
      <div
        style={{
          position: "absolute",
          inset: "22% 24%",
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
      {/* 公转轨道层：旋转带动全部徽章绕中心转 */}
      <div className="orbit-spin" style={{ position: "absolute", inset: 0 }}>
        {FORMATS.map((f, i) => {
          const angle = (i / FORMATS.length) * Math.PI * 2 - Math.PI / 2;
          const r = 49; // 圆形轨道半径（正方容器下 x/y 像素一致；49% 确保徽章公转全程不接触插画，含对角方向）
          const x = 50 + r * Math.cos(angle);
          const y = 50 + r * Math.sin(angle);
          return (
            <div
              key={f}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="orbit-counter" style={badgeStyle}>
                {f}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
