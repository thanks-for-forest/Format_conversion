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
    // 对比滑块仅图片互转组合有意义（文档/音视频无并排视觉可比性）
    const IMG_IN = ["png", "jpg", "webp", "bmp", "gif"];
    const IMG_OUT = ["jpg", "png", "webp"];
    const comparable = IMG_IN.includes(sourceExt) && IMG_OUT.includes(target);
    return (
      <div style={{ marginTop: 24 }}>
        <p style={{ color: "var(--brand)", fontWeight: 600 }}>{COPY.done}</p>
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
      <p style={{ marginTop: 24, color: "var(--danger)" }}>
        {COPY.errorPrefix}
        {message}
      </p>
    );
  }
  return null;
}
