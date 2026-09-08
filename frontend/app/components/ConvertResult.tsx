"use client";

// 转换结果与错误展示块（切片 12c 增强：体积变化数据行 + 图片前后对比滑块）。

import CompareSlider from "./CompareSlider";

const COPY = {
  done: "转换完成，点击下载：",
  errorPrefix: "出错了：",
  localPath: "本地（文件未上传）",
  serverPath: "服务端",
} as const;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ConvertResult({
  phase,
  message,
  downloadUrl,
  downloadName,
  pathUsed,
  sourceExt,
  target,
  inSize,
  outSize,
  beforeUrl,
}: {
  phase: "idle" | "converting" | "done" | "error";
  message: string;
  downloadUrl: string;
  downloadName: string;
  pathUsed: "local" | "server" | null;
  sourceExt: string;
  target: string;
  inSize: number;
  outSize: number | null;
  beforeUrl: string;
}) {
  if (phase === "done") {
    // 体积变化：缩小显示「减少 X%」，增大则中性展示（文档转 PDF 等可能变大）
    const delta =
      outSize != null && inSize > 0 && outSize !== inSize
        ? outSize < inSize
          ? ` · 减少 ${Math.round((1 - outSize / inSize) * 100)}%`
          : ` · 增大 ${Math.round((outSize / inSize - 1) * 100)}%`
        : "";
    // 对比滑块仅在「无损/可能无损源 → 有损目标（jpg/webp）」显示：画质疑虑的真实来源；
    // 目标为 png（无损）时转换像素级一致，滑块拖动无变化，不显示（避免困惑）
    const IMG_IN = ["png", "jpg", "webp", "bmp", "gif"];
    const comparable = IMG_IN.includes(sourceExt) && (target === "jpg" || target === "webp");
    return (
      <div
        style={{
          marginTop: 24,
          background: "var(--brand-soft)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-md)",
          padding: "14px 18px",
        }}
      >
        <p style={{ color: "var(--ink)", fontWeight: 600, margin: 0 }}>✅ {COPY.done}</p>
        <a
          href={downloadUrl}
          download={downloadName}
          style={{ color: "var(--brand)", fontWeight: 600, textDecoration: "underline" }}
        >
          {downloadName}
        </a>
        {outSize != null && (
          <p style={{ fontSize: 13, color: "var(--body-color)", margin: "6px 0 0" }}>
            {fmtSize(inSize)} → {fmtSize(outSize)}
            {delta}
          </p>
        )}
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          转换方式：{pathUsed === "local" ? COPY.localPath : COPY.serverPath}
        </p>
        {comparable && beforeUrl && downloadUrl && (
          <CompareSlider beforeUrl={beforeUrl} afterUrl={downloadUrl} afterName={downloadName} />
        )}
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div
        style={{
          marginTop: 24,
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "var(--r-md)",
          padding: "12px 18px",
          color: "var(--danger)",
        }}
      >
        {COPY.errorPrefix}
        {message}
      </div>
    );
  }
  return null;
}
