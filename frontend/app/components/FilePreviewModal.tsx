"use client";

// 文件内容预览浮层（切片 10c 反馈）：点击清单文件名打开，按类型渲染：
// 图片 <img> / 音频 <audio> / 视频 <video> / 文本（txt/csv/md/html 源码）/ Office（服务端转 PDF 内嵌）。
// File 对象在页面内存中，跨路由会丢失，故用全屏浮层而非独立路由。
// blob URL 在 effect 中创建、cleanup 时 revoke（StrictMode 双挂载下会重建，保证 src 始终有效）；
// 上层须以 key 强制换文件时重挂载。

import { useEffect, useState } from "react";
import { categoryOf, sourceExtOf } from "../lib/formats";
import OfficePreview from "./OfficePreview";

// 文本类扩展名（按源码显示）
const TEXT_EXTS = ["txt", "csv", "md", "html"];
// Office 类（浏览器无法原生渲染，显示占位提示）
const OFFICE_EXTS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"];

type PreviewKind = "image" | "audio" | "video" | "text" | "office";

function kindOf(file: File): PreviewKind {
  const ext = sourceExtOf(file.name);
  if (TEXT_EXTS.includes(ext)) return "text";
  if (OFFICE_EXTS.includes(ext)) return "office";
  const cat = categoryOf(ext);
  if (cat === "image") return "image";
  if (cat === "audio") return "audio";
  if (cat === "video") return "video";
  return "office";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePreviewModal({
  file,
  onClose,
}: {
  file: File;
  onClose: () => void;
}) {
  const kind = kindOf(file);
  // 创建/撤销都在 effect 内：StrictMode 模拟卸载会 revoke 旧 URL，重挂载时重建，state 始终有效
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (kind === "text" || kind === "office") return;
    const u = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- blob URL 生命周期管理，仅创建一次不循环
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, kind]);

  useEffect(() => {
    if (kind !== "text") return;
    let alive = true;
    file
      .text()
      .then((t) => {
        if (alive) setText(t);
      })
      .catch(() => {
        if (alive) setText("（无法读取文件内容）");
      });
    return () => {
      alive = false;
    };
  }, [file, kind]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          maxWidth: 640,
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 16px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={file.name}
              >
                {file.name}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                {formatSize(file.size)} · {file.type || "未知类型"}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                border: "none",
                background: "none",
                fontSize: 20,
                lineHeight: 1,
                cursor: "pointer",
                color: "var(--muted)",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        <div
          style={{
            padding: 16,
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {kind === "image" && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.name}
              style={{ maxWidth: "100%", maxHeight: "70vh" }}
            />
          )}
          {kind === "audio" && url && <audio controls src={url} style={{ width: "100%" }} />}
          {kind === "video" && url && (
            <video controls src={url} style={{ maxWidth: "100%", maxHeight: "70vh" }} />
          )}
          {kind === "text" && (
            <pre
              style={{
                width: "100%",
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color: "var(--ink)",
              }}
            >
              {text}
            </pre>
          )}
          {kind === "office" && <OfficePreview file={file} />}
        </div>
      </div>
    </div>
  );
}
