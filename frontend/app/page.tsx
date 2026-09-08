import Link from "next/link";

import SiteFrame from "./components/SiteFrame";

// 首页：通用转换器入口（格式自选）。转换逻辑在 components/Converter.tsx。

const SUBTITLE =
  "图片互转 · 文档转 PDF · 音频/视频互转（mp3 / mp4 / mkv 等）· 提取音轨 · Markdown 转 HTML";

export default function Home() {
  return (
    <SiteFrame
      heading={
        <>
          <h1 style={{ fontSize: 32, lineHeight: 1.3, margin: "0 0 10px", color: "var(--ink)" }}>
            在线文件格式转换
          </h1>
          <p style={{ fontSize: 14, color: "var(--body-color)" }}>{SUBTITLE}</p>
          <p style={{ fontSize: 14, marginTop: 12 }}>
            <Link href="/archive" style={{ color: "var(--brand)", fontWeight: 600 }}>
              压缩包打包 / 解压 →
            </Link>
          </p>
        </>
      }
    />
  );
}
