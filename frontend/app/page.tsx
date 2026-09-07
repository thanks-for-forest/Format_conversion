"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import {
  buildDownloadUrl,
  createConversion,
  logout,
  pollUntilDone,
  reportLocalCount,
  type TaskInfo,
} from "./lib/api";
import { canConvertLocally, convertLocally } from "./lib/convert";
import { useQuota } from "./lib/useQuota";
import AuthBar from "./components/AuthBar";
import ConvertResult from "./components/ConvertResult";
import QuotaHints from "./components/QuotaHints";

const SOURCE_EXTS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];
const TARGET_EXTS = ["png", "jpg", "webp"];

const COPY = {
  subtitle: "本地优先 · 图片互转（png / jpg / webp / bmp / gif → png / jpg / webp）",
  dropHint: "拖拽图片到此处，或点击选择",
  targetLabel: "转换为：",
  convert: "开始转换",
  converting: "转换中…",
  limitHint: "支持 png / jpg / jpeg / webp / bmp / gif",
} as const;

function sourceExtOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  return ext === "jpeg" ? "jpg" : ext;
}

function outputName(name: string, target: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${target}`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("jpg");
  const [phase, setPhase] = useState<"idle" | "converting" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [pickError, setPickError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pathUsed, setPathUsed] = useState<"local" | "server" | null>(null);
  const { user, setUser, quota, reloadQuota } = useQuota();

  const handleLogout = () =>
    logout().then(() => setUser(null)).finally(reloadQuota); // 退出后回到匿名档

  const busy = phase === "converting";
  const sourceExt = file ? sourceExtOf(file.name) : "";
  const targetOptions = TARGET_EXTS.filter((t) => t !== sourceExt);
  // 预检（双保险之一，后端 429 兜底）：次数用尽或文件超单文件上限时禁用
  const quotaExhausted = !!quota && quota.used.count >= quota.limit.count;
  const oversize = !!file && !!quota && file.size > quota.limit.max_upload_bytes;
  const blocked = quotaExhausted || oversize;

  async function handleConvert() {
    if (!file) return;
    setPhase("converting");
    setMessage("");
    try {
      // 本地优先：浏览器 Canvas 转换，文件不上传；失败自动回退服务端
      if (canConvertLocally(sourceExt, target, file.size)) {
        try {
          const blob = await convertLocally(file, target);
          setPathUsed("local");
          setDownloadUrl(URL.createObjectURL(blob));
          setDownloadName(outputName(file.name, target));
          setPhase("done");
          reportLocalCount()
            .then(reloadQuota) // 本地计次不计流量，失败不影响结果
            .catch(() => {});
          return;
        } catch {
          setPathUsed(null);
        }
      }
      setPathUsed("server");
      const created = await createConversion(file, target);
      const info: TaskInfo = await pollUntilDone(created.task_id, created.pass_key);
      if (info.status !== "succeeded") {
        throw new Error(info.message || "转换失败");
      }
      setDownloadUrl(buildDownloadUrl(created.task_id, created.pass_key));
      setDownloadName(outputName(file.name, target));
      setPhase("done");
      reloadQuota();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function resetResult() {
    setPhase("idle");
    setMessage("");
    setDownloadUrl((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });
    setPathUsed(null);
  }

  function applyPickedFile(picked: File | null) {
    if (!picked) {
      setFile(null);
      setPickError("");
      resetResult();
      return;
    }
    const ext = sourceExtOf(picked.name);
    if (!SOURCE_EXTS.includes(ext)) {
      setFile(null);
      resetResult();
      setPickError(`仅支持 ${SOURCE_EXTS.join(" / ")}，收到：${picked.name}`);
      return;
    }
    setFile(picked);
    setPickError("");
    resetResult();
    if (target === ext) {
      setTarget(TARGET_EXTS.find((t) => t !== ext) ?? "jpg");
    }
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
      <AuthBar user={user} quota={quota} onLogout={handleLogout} />
      <h1 style={{ fontSize: 24, margin: 0 }}>文件格式转换</h1>
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
          accept={SOURCE_EXTS.map((e) => `.${e}`).join(",")}
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

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <label style={{ fontSize: 14, color: "#374151" }}>
          {COPY.targetLabel}
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              resetResult();
            }}
            disabled={busy || !file}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
            }}
          >
            {targetOptions.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={handleConvert}
          disabled={!file || busy || blocked}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: !file || busy || blocked ? "#c7cdd4" : "#2563eb",
            color: "#fff",
            cursor: !file || busy || blocked ? "not-allowed" : "pointer",
          }}
        >
          {busy ? COPY.converting : COPY.convert}
        </button>
      </div>

      {quota && <QuotaHints quota={quota} oversize={oversize} />}

      <ConvertResult
        phase={phase}
        message={message}
        downloadUrl={downloadUrl}
        downloadName={downloadName}
        pathUsed={pathUsed}
      />
    </main>
  );
}
