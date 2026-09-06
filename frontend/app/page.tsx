"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

const ACCEPT_EXT = ".png";
const ACCEPT_MIME = "image/png";

const COPY = {
  title: "文件格式转换",
  subtitle: "切片 2：PNG → JPG（服务端异步转换）",
  pick: "选择 PNG 文件",
  dropHint: "拖拽 PNG 文件到此处，或点击选择",
  convert: "开始转换",
  converting: "转换中…",
  done: "转换完成，点击下载：",
  failed: "转换失败",
  errorPrefix: "出错了：",
  limitHint: "匿名上限 50MB，仅支持 .png 扩展名",
} as const;

interface CreateResult {
  task_id: string;
  pass_key: string;
  status: string;
  in_size: number;
}

interface TaskInfo {
  task_id: string;
  status: string;
  message: string;
  source_name: string;
  target_ext: string;
  in_size: number;
  out_size: number | null;
  files_removed: boolean;
}

interface Envelope<T> {
  code: number;
  data: T | null;
  message: string;
}

function toJpgName(name: string): string {
  return `${name.slice(0, -4)}.jpg`;
}

async function pollUntilDone(taskId: string, passKey: string): Promise<TaskInfo> {
  for (;;) {
    const resp = await fetch(
      `${API_BASE}/api/tasks/${taskId}?pass_key=${passKey}`
    );
    const body = (await resp.json()) as Envelope<TaskInfo>;
    if (body.code !== 0 || !body.data) {
      throw new Error(body.message || `HTTP ${resp.status}`);
    }
    const data = body.data;
    if (data.status === "succeeded" || data.status === "failed") {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "converting" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [pickError, setPickError] = useState("");
  const [dragging, setDragging] = useState(false);

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
      const body = (await resp.json()) as Envelope<CreateResult>;
      if (body.code !== 0 || !body.data) {
        throw new Error(body.message || `HTTP ${resp.status}`);
      }
      const { task_id, pass_key } = body.data;
      const info = await pollUntilDone(task_id, pass_key);
      if (info.status !== "succeeded") {
        throw new Error(info.message || "转换失败");
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

  function applyPickedFile(picked: File | null) {
    if (!picked) {
      setFile(null);
      setPhase("idle");
      setMessage("");
      setDownloadUrl("");
      setPickError("");
      return;
    }
    const name = picked.name.toLowerCase();
    const ok = name.endsWith(ACCEPT_EXT) || picked.type === ACCEPT_MIME;
    if (!ok) {
      setFile(null);
      setPickError(`仅支持 PNG 文件（${ACCEPT_EXT}），收到：${picked.name}`);
      return;
    }
    setFile(picked);
    setPickError("");
    setPhase("idle");
    setMessage("");
    setDownloadUrl("");
  }

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    applyPickedFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    applyPickedFile(e.dataTransfer.files?.[0] ?? null);
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

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          margin: "24px 0 8px",
          padding: 16,
          border: dragging ? "2px dashed #2563eb" : "2px dashed #d1d5db",
          borderRadius: 8,
          background: dragging ? "#eff6ff" : "#f9fafb",
          textAlign: "center",
        }}
      >
        <input
          type="file"
          accept={`${ACCEPT_MIME},${ACCEPT_EXT}`}
          onChange={handlePick}
          disabled={busy}
          style={{ display: "block", margin: "0 auto" }}
        />
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0 0" }}>
          {COPY.dropHint}
        </p>
      </div>
      {file && (
        <p style={{ fontSize: 14, margin: "0 0 8px", color: "#111827" }}>
          已选：{file.name}
        </p>
      )}
      {pickError && (
        <p style={{ margin: "0 0 8px", color: "#dc2626" }}>{pickError}</p>
      )}
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