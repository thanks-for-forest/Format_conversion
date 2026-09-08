"use client";

// 转换结果与错误展示块（从 page 拆出，控制单文件行数）。

const COPY = {
  done: "转换完成，点击下载：",
  errorPrefix: "出错了：",
  localPath: "本地（文件未上传）",
  serverPath: "服务端",
} as const;

export default function ConvertResult({
  phase,
  message,
  downloadUrl,
  downloadName,
  pathUsed,
}: {
  phase: "idle" | "converting" | "done" | "error";
  message: string;
  downloadUrl: string;
  downloadName: string;
  pathUsed: "local" | "server" | null;
}) {
  if (phase === "done") {
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
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          转换方式：{pathUsed === "local" ? COPY.localPath : COPY.serverPath}
        </p>
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
