import type { Metadata } from "next";
import Link from "next/link";

import ArchivePanel from "../../components/ArchivePanel";

// SEO 落地页（切片 9）：「在线解压 ZIP / TAR.GZ」关键词。

export const metadata: Metadata = {
  title: "在线解压 ZIP / TAR.GZ - 免费解压缩工具",
  description:
    "免费在线解压 ZIP 和 TAR.GZ 压缩包：25MB 内浏览器本地完成、文件不上传服务器，解压出的文件逐个下载，带压缩包炸弹与路径穿越防护，无需注册。",
};

export default function ZipToFilesPage() {
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
      <h1 style={{ fontSize: 24, margin: 0 }}>在线解压 ZIP / TAR.GZ</h1>
      <p style={{ color: "#6b7280" }}>
        上传 ZIP 或 TAR.GZ 压缩包，解压出的文件逐个点击下载。
        25MB 内浏览器本地完成，文件不会上传服务器；更大体积自动改用服务端处理。
      </p>
      <ArchivePanel />
      <section style={{ marginTop: 24, fontSize: 13, color: "#6b7280" }}>
        <h2 style={{ fontSize: 15, color: "#111827" }}>解压步骤</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 1.8, margin: 0 }}>
          <li>选择 ZIP 或 TAR.GZ 压缩包（TAR.GZ 会统一转成 ZIP 交付）</li>
          <li>点击「解压」，本地完成后按文件列表逐个下载</li>
          <li>内置压缩包炸弹与路径穿越防护，恶意包自动拦截</li>
        </ol>
        <p style={{ lineHeight: 1.8, margin: "8px 0 0" }}>
          需要反向操作？试试{" "}
          <Link href="/convert/files-to-zip" style={{ color: "#2563eb" }}>
            文件打包成 ZIP
          </Link>
          ；解压出图片后还能{" "}
          <Link href="/convert/png-to-jpg" style={{ color: "#2563eb" }}>
            PNG 转 JPG
          </Link>
          。
        </p>
      </section>
    </main>
  );
}
