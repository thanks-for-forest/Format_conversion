"use client";

// 图片转换前后对比滑块（切片 12c，借鉴 TinyPNG「Can you tell the difference?」）：
// 结果图为底层，原图覆盖在上并以 clip-path 控制露出宽度；透明 range 接管整个区域，
// 拖动即对比。两图宽高一致（转换不改变尺寸），objectFit cover 兜底微差。

import { useState } from "react";

export default function CompareSlider({
  beforeUrl,
  afterUrl,
  afterName,
}: {
  beforeUrl: string;
  afterUrl: string;
  afterName: string;
}) {
  const [pos, setPos] = useState(50);
  const tagStyle: React.CSSProperties = {
    position: "absolute",
    top: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    background: "rgba(18,20,29,.55)",
    borderRadius: 6,
    padding: "2px 8px",
    pointerEvents: "none",
  };
  return (
    <div
      style={{
        position: "relative",
        maxWidth: 480,
        marginTop: 12,
        borderRadius: "var(--r-sm)",
        overflow: "hidden",
        border: "1px solid var(--line)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterUrl} alt={`转换后 ${afterName}`} style={{ display: "block", width: "100%" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt="原图"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          clipPath: `inset(0 ${100 - pos}% 0 0)`,
        }}
      />
      <span style={{ ...tagStyle, left: 8 }}>原图</span>
      <span style={{ ...tagStyle, right: 8 }}>转换后</span>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${pos}%`,
          width: 2,
          background: "#fff",
          pointerEvents: "none",
        }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="拖动对比转换前后"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "ew-resize",
        }}
      />
    </div>
  );
}
