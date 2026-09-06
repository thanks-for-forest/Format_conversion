"use client";

import { useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

const COPY = {
  title: "文件格式转换",
  subtitle: "切片 1：PNG → JPG（服务端转换演示）",
  pick: "选择 PNG 文件",
  convert: "开始转换",
  converting: "转换中…",
  done: "转换完成，点击下载：",
  failed: "转换失败",
  errorPrefix: "出错了：",
  limitHint: "匿名上限 50MB，仅支持 .png 扩展名",
} as const;

interface ConvertOk {
  task_id: string;
  pass_key: string;
  status: string;
  out_size: number | null;
}

interface Envelope {
  code: number;
  data: ConvertOk | null;
  message: string;
}

function toJpgName(name: string): string {
  return `${name.slice(0, -4)}.jpg`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "converting" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleConvert() {
    if (!file) return;
    setPhase("converting");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("target", "jpg");
      const resp = await fetch(`${API_BASE}/api/convert`, {
        method: "POST",
        body: form,
      });
      const body = (await resp.json()) as Envelope;
      if (body.code !== 0 || !body.data) {
        throw new Error(body.message || `HTTP ${resp.status}`);
      }
      const { task_id, pass_key, status } = body.data;
      if (status !== "succeeded") {
        throw new Error(`任务状态异常：${status}`);
      }
      setDownloadUrl(
        `${API_BASE}/api/tasks/${task_id}/download?pass_key=${pass_key}`
      );
      setDownloadName(toJpgName(file.name));
      setPhase("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function reset() {
    setFile(null);
    setPhase("idle");
    setMessage("");
    setDownloadUrl("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = phase === "converting";

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
      <h1 style={{ fontSize: 24, margin: 0 }}>{COPY.title}</h1>
      <p style={{ color: "#6b7280" }}>{COPY.subtitle}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,.png"
        onChange={(e) => {
          reset();
          setFile(e.target.files?.[0] ?? null);
        }}
        disabled={busy}
        style={{ display: "block", margin: "24px 0 8px" }}
      />
      <p style={{ fontSize: 12, color: "#9ca3af" }}>{COPY.limitHint}</p>

      <button
        onClick={handleConvert}
        disabled={!file || busy}
        style={{
          padding: "10px 24px",
          borderRadius: 8,
          border: "none",
          background: !file || busy ? "#c7cdd4" : "#2563eb",
          color: "#fff",
          cursor: !file || busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? COPY.converting : COPY.convert}
      </button>

      {phase === "done" && (
        <div style={{ marginTop: 24 }}>
          <p style={{ color: "#059669" }}>{COPY.done}</p>
          <a
            href={downloadUrl}
            download={downloadName}
            style={{ color: "#2563eb", fontWeight: 600 }}
          >
            {downloadName}
          </a>
        </div>
      )}

      {phase === "error" && (
        <p style={{ marginTop: 24, color: "#dc2626" }}>
          {COPY.errorPrefix}
          {message}
        </p>
      )}
    </main>
  );
}