import type { Metadata } from "next";
import Link from "next/link";

import ArchivePanel from "../../components/ArchivePanel";

// SEO 落地页（切片 9）：「文件打包成 ZIP」关键词。

export const metadata: Metadata = {
  title: "文件打包成 ZIP - 免费在线压缩工具",
  description:
    "免费在线把多个文件打包成一个 ZIP 压缩包：25MB 内浏览器本地完成、文件不上传服务器，支持中文文件名与任意文件类型，无需注册即可使用。",
};

export default function FilesToZipPage() {
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
      <h1 style={{ fontSize: 24, margin: 0 }}>文件打包成 ZIP</h1>
      <p style={{ color: "#6b7280" }}>
        选择多个文件（图片、文档、视频均可），一键打包成一个 ZIP 压缩包。
        25MB 内浏览器本地完成，文件不会上传服务器；更大体积自动改用服务端打包。
      </p>
      <ArchivePanel />
      <section style={{ marginTop: 24, fontSize: 13, color: "#6b7280" }}>
        <h2 style={{ fontSize: 15, color: "#111827" }}>打包步骤</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 1.8, margin: 0 }}>
          <li>点击选择或拖入多个文件（支持按住 Ctrl 多选）</li>
          <li>点击「打包下载」，本地完成后直接下载 ZIP 文件</li>
          <li>同名文件自动编号去重（file.txt、file(1).txt）</li>
        </ol>
        <p style={{ lineHeight: 1.8, margin: "8px 0 0" }}>
          需要反向操作？试试{" "}
          <Link href="/convert/zip-to-files" style={{ color: "#2563eb" }}>
            在线解压 ZIP / TAR.GZ
          </Link>
          ；还想转换图片格式？看{" "}
          <Link href="/convert/png-to-jpg" style={{ color: "#2563eb" }}>
            PNG 转 JPG
          </Link>
          。
        </p>
      </section>
    </main>
  );
}
