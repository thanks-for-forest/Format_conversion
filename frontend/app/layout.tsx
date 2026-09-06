import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "文件格式转换",
  description: "免费在线文件格式转换工具：图片、文档、音视频、压缩包",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
