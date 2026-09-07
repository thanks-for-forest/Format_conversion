import type { Metadata } from "next";
import Link from "next/link";
import SiteFrame from "../../components/SiteFrame";
import { COMBOS, parseCombo } from "../../lib/formats";

// SEO 落地页：/convert/png-to-jpg 等 12 个静态组合页（五进三出，去掉同格式）。
// generateStaticParams 预渲染全部组合；dynamicParams=false 使非法 slug 直接 404。

export const dynamicParams = false;

export function generateStaticParams() {
  return COMBOS.map((c) => ({ "a-to-b": c.slug }));
}

type PageProps = { params: Promise<{ "a-to-b": string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const combo = parseCombo((await params)["a-to-b"]);
  if (!combo) return { title: "页面不存在" };
  const F = combo.from.toUpperCase();
  const T = combo.to.toUpperCase();
  return {
    title: `${F} 转 ${T} - 免费在线图片格式转换`,
    description: `免费在线把 ${F} 图片转换成 ${T}：浏览器本地完成、图片不上传服务器，超过 25MB 自动改用服务端转换，无需注册即可使用。`,
  };
}

export default async function ConvertPage({ params }: PageProps) {
  // dynamicParams=false 保证 params 必命中 COMBOS
  const combo = parseCombo((await params)["a-to-b"])!;
  const F = combo.from.toUpperCase();
  const T = combo.to.toUpperCase();
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
          <p style={{ color: "#6b7280" }}>
            免费在线把 {F} 图片转换成 {T}：浏览器本地完成转换，图片不会上传服务器；
            超过 25MB 自动改用服务端转换，无需注册即可使用。
          </p>
        </>
      }
      below={
        <section style={{ marginTop: 24, fontSize: 13, color: "#6b7280" }}>
          <h2 style={{ fontSize: 15, color: "#111827" }}>转换步骤</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.8, margin: 0 }}>
            <li>选择或拖入 {F} 图片</li>
            <li>点击「开始转换」，本地完成后直接下载 {T} 文件</li>
            <li>超过 25MB 的大文件会自动走服务端转换，稍候即可下载</li>
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
