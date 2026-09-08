import Link from "next/link";

import SiteFrame from "./components/SiteFrame";

// 首页：通用转换器入口（格式自选）。转换逻辑在 components/Converter.tsx；
// 白卡下方为产品描述分段（参考 TinyPNG 的产品叙事区节奏）。

const SUBTITLE =
  "图片互转 · 文档转 PDF · 音频/视频互转（mp3 / mp4 / mkv 等）· 提取音轨 · Markdown 转 HTML";

// 常见格式徽章：一眼看清支持范围（也承载落地页关键词）
const FORMATS = ["PNG", "JPG", "WEBP", "BMP", "PDF", "DOCX", "XLSX", "PPTX", "MP4", "MP3", "MKV", "ZIP"];

// 产品亮点：与真实能力一一对应（本地转换 / 服务端兜底 / 即转即删）
const HIGHLIGHTS = [
  {
    icon: "🖼️",
    title: "图片互转",
    desc: "PNG / JPG / WebP / BMP 在浏览器本地完成，文件不出设备；转换后可拖动滑块对比画质。",
  },
  {
    icon: "📄",
    title: "文档转 PDF",
    desc: "Word / Excel / PPT / ODF 一键转 PDF，排版还原与下载效果一致。",
  },
  {
    icon: "🎬",
    title: "音视频互转",
    desc: "MP4 / MOV / MKV / WebM / AVI 互转，还能从视频中提取 MP3 音轨。",
  },
  {
    icon: "🔒",
    title: "隐私优先",
    desc: "文件仅在服务器临时处理，转换完成下载后立即删除，不留存、不用于其他用途。",
  },
] as const;

export default function Home() {
  return (
    <SiteFrame
      heading={
        <>
          <h1 style={{ fontSize: 32, lineHeight: 1.3, margin: "0 0 10px", color: "var(--ink)" }}>
            在线文件格式转换
          </h1>
          <p style={{ fontSize: 14, color: "var(--body-color)" }}>{SUBTITLE}</p>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: 18,
            }}
          >
            {FORMATS.map((f) => (
              <span
                key={f}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: "var(--body-color)",
                  background: "var(--card-bg)",
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  padding: "4px 12px",
                }}
              >
                {f}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 14, marginTop: 14 }}>
            <Link href="/archive" style={{ color: "var(--brand)", fontWeight: 600 }}>
              压缩包打包 / 解压 →
            </Link>
          </p>
        </>
      }
      belowCard={
        <section
          style={{
            background: "var(--card-bg)",
            borderTop: "1px solid var(--line)",
            padding: "56px 16px 64px",
          }}
        >
          <div style={{ maxWidth: "var(--maxw)", margin: "0 auto", textAlign: "center" }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
                color: "var(--brand)",
                margin: "0 0 10px",
              }}
            >
              免费 · 无需注册
            </p>
            <h2 style={{ fontSize: 28, lineHeight: 1.35, color: "var(--ink)", margin: "0 0 12px" }}>
              28 种格式、80+ 种转换组合，一个页面全搞定
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--body-color)", margin: "0 auto 32px", maxWidth: 560 }}>
              为设计师、开发者、学生和办公人群打造的免费在线转换工具——
              图片转换在浏览器本地完成，服务端转换的文件处理完即删，
              匿名即可使用，登录后每日额度更高。
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                textAlign: "left",
              }}
            >
              {HIGHLIGHTS.map((h) => (
                <div
                  key={h.title}
                  style={{
                    background: "var(--page-bg)",
                    borderRadius: "var(--r-md)",
                    padding: "20px 18px",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 8 }} aria-hidden>
                    {h.icon}
                  </div>
                  <h3 style={{ fontSize: 15, color: "var(--ink)", margin: "0 0 6px" }}>{h.title}</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--body-color)", margin: 0 }}>
                    {h.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      }
    />
  );
}
