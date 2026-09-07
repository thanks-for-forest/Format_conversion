import Link from "next/link";

import SiteFrame from "./components/SiteFrame";

// 首页：通用转换器入口（格式自选）。转换逻辑在 components/Converter.tsx。

const SUBTITLE =
  "图片互转 · 文档转 PDF（docx / xlsx / pptx 等）· 音频互转（mp3 / wav / flac 等）· Markdown 转 HTML";

export default function Home() {
  return (
    <SiteFrame
      heading={
        <>
          <h1 style={{ fontSize: 24, margin: 0 }}>文件格式转换</h1>
          <p style={{ color: "#6b7280" }}>{SUBTITLE}</p>
          <p style={{ fontSize: 14 }}>
            <Link href="/archive" style={{ color: "#2563eb" }}>
              压缩包打包 / 解压 →
            </Link>
          </p>
        </>
      }
    />
  );
}
