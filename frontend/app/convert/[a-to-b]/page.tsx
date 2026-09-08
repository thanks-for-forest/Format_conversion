import type { Metadata } from "next";
import Link from "next/link";
import SiteFrame from "../../components/SiteFrame";
import { type Combo, COMBOS, parseCombo } from "../../lib/formats";

// SEO 落地页：/convert/X-to-Y 静态组合页（图片 12 + 文档转 PDF 12 + 音频互转 30
// + 视频互转 20 + 提取音轨 5 + MD 转 HTML）。
// generateStaticParams 预渲染全部组合；dynamicParams=false 使非法 slug 直接 404。
// 文案按类别分支：图片本地优先 / 文档 LibreOffice / 音频视频 ffmpeg / md 本地渲染。

export const dynamicParams = false;

export function generateStaticParams() {
  return COMBOS.map((c) => ({ "a-to-b": c.slug }));
}

type PageProps = { params: Promise<{ "a-to-b": string }> };

function buildCopy(combo: Combo): {
  title: string;
  description: string;
  intro: string;
  steps: string[];
} {
  const F = combo.from.toUpperCase();
  const T = combo.to.toUpperCase();
  if (combo.category === "doc" && combo.to === "pdf") {
    return {
      title: `${F} 转 PDF - 免费在线文档转换`,
      description: `免费在线把 ${F} 文档转换成 PDF：服务端 LibreOffice 转换，文件处理完即删、不留存，无需注册即可使用。`,
      intro: `免费在线把 ${F} 文档转换成 PDF：上传后在服务端用 LibreOffice 转换，文件处理完即删，无需注册即可使用。`,
      steps: [
        `选择或拖入 ${F} 文档`,
        "点击「开始转换」，服务端转换完成后自动下载 PDF 文件",
        "文件在服务端处理完即删，不会留存",
      ],
    };
  }
  if (combo.category === "doc") {
    return {
      title: "MD 转 HTML - 免费在线 Markdown 转换",
      description:
        "免费在线把 Markdown 转换成 HTML：浏览器本地渲染完成，内容不上传服务器，无需注册即可使用。",
      intro:
        "免费在线把 Markdown 转换成 HTML 文件：浏览器本地渲染完成，内容不上传服务器，无需注册即可使用。",
      steps: [
        "选择或拖入 .md 文件",
        "点击「开始转换」，本地渲染完成后直接下载 HTML 文件",
        "全程在浏览器完成，内容不会上传",
      ],
    };
  }
  if (combo.category === "audio") {
    return {
      title: `${F} 转 ${T} - 免费在线音频格式转换`,
      description: `免费在线把 ${F} 音频转换成 ${T}：服务端 ffmpeg 转换，保留原始音质，文件处理完即删、不留存，无需注册即可使用。`,
      intro: `免费在线把 ${F} 音频转换成 ${T}：上传后在服务端用 ffmpeg 转换，文件处理完即删，无需注册即可使用。`,
      steps: [
        `选择或拖入 ${F} 音频文件`,
        `点击「开始转换」，服务端转换完成后自动下载 ${T} 文件`,
        "文件在服务端处理完即删，不会留存",
      ],
    };
  }
  if (combo.category === "video") {
    if (combo.to === "mp3") {
      return {
        title: `${F} 转 MP3 - 免费在线提取音轨`,
        description: `免费在线把 ${F} 视频中的音频提取成 MP3：服务端 ffmpeg 转换，文件处理完即删、不留存，无需注册即可使用。`,
        intro: `免费在线把 ${F} 视频中的音频提取成 MP3：上传后在服务端用 ffmpeg 提取音轨，文件处理完即删，无需注册即可使用。`,
        steps: [
          `选择或拖入 ${F} 视频`,
          "点击「开始转换」，服务端提取音轨后自动下载 MP3 文件",
          "文件在服务端处理完即删，不会留存",
        ],
      };
    }
    return {
      title: `${F} 转 ${T} - 免费在线视频格式转换`,
      description: `免费在线把 ${F} 视频转换成 ${T}：服务端 ffmpeg 转码，文件处理完即删、不留存，无需注册即可使用。`,
      intro: `免费在线把 ${F} 视频转换成 ${T}：上传后在服务端用 ffmpeg 转码，文件处理完即删，无需注册即可使用。`,
      steps: [
        `选择或拖入 ${F} 视频`,
        `点击「开始转换」，服务端转码完成后自动下载 ${T} 文件`,
        "视频转码耗时较长，请耐心等待；文件处理完即删",
      ],
    };
  }
  return {
    title: `${F} 转 ${T} - 免费在线图片格式转换`,
    description: `免费在线把 ${F} 图片转换成 ${T}：浏览器本地完成、图片不上传服务器，超过 25MB 自动改用服务端转换，无需注册即可使用。`,
    intro: `免费在线把 ${F} 图片转换成 ${T}：浏览器本地完成转换，图片不会上传服务器；超过 25MB 自动改用服务端转换，无需注册即可使用。`,
    steps: [
      `选择或拖入 ${F} 图片`,
      `点击「开始转换」，本地完成后直接下载 ${T} 文件`,
      "超过 25MB 的大文件会自动走服务端转换，稍候即可下载",
    ],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const combo = parseCombo((await params)["a-to-b"]);
  if (!combo) return { title: "页面不存在" };
  const copy = buildCopy(combo);
  return { title: copy.title, description: copy.description };
}

export default async function ConvertPage({ params }: PageProps) {
  // dynamicParams=false 保证 params 必命中 COMBOS
  const combo = parseCombo((await params)["a-to-b"])!;
  const F = combo.from.toUpperCase();
  const T = combo.to.toUpperCase();
  const copy = buildCopy(combo);
  const others = COMBOS.filter((c) => c.slug !== combo.slug);
  return (
    <SiteFrame
      lockedSource={combo.from}
      lockedTarget={combo.to}
      heading={
        <>
          <h1 style={{ fontSize: 24, margin: 0 }}>
            {F} 转 {T}
          </h1>
          <p style={{ color: "#6b7280" }}>{copy.intro}</p>
        </>
      }
      below={
        <section style={{ marginTop: 24, fontSize: 13, color: "#6b7280" }}>
          <h2 style={{ fontSize: 15, color: "#111827" }}>转换步骤</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.8, margin: 0 }}>
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h2 style={{ fontSize: 15, color: "#111827" }}>其他格式转换</h2>
          <p style={{ lineHeight: 1.8, margin: 0 }}>
            {others.map((c, i) => (
              <span key={c.slug}>
                <Link href={`/convert/${c.slug}`} style={{ color: "#2563eb" }}>
                  {c.from.toUpperCase()} 转 {c.to.toUpperCase()}
                </Link>
                {i < others.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
          <p style={{ lineHeight: 1.8, margin: "8px 0 0" }}>
            压缩包工具：
            <Link href="/convert/files-to-zip" style={{ color: "#2563eb" }}>
              文件打包成 ZIP
            </Link>{" "}
            ·{" "}
            <Link href="/convert/zip-to-files" style={{ color: "#2563eb" }}>
              在线解压 ZIP / TAR.GZ
            </Link>
          </p>
        </section>
      }
    />
  );
}
