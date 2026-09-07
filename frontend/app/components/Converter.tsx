"use client";

// 转换器主体：选择文件 → 本地优先转换 → 服务端兜底；首页与 SEO 落地页共用。
// 传入 lockedSource/lockedTarget 时锁定格式（落地页场景）：隐藏目标下拉、
// 仅接受该来源格式、不自动切换目标。

import { useState, type ChangeEvent, type DragEvent } from "react";
import {
  buildDownloadUrl,
  createConversion,
  pollUntilDone,
  reportLocalCount,
  type QuotaSummary,
  type TaskInfo,
} from "../lib/api";
import { canConvertLocally, convertLocally } from "../lib/convert";
import {
  ACCEPT_ALIAS,
  SOURCE_EXTS,
  TARGET_EXTS,
  outputName,
  sourceExtOf,
} from "../lib/formats";
import ConvertResult from "./ConvertResult";
import QuotaHints from "./QuotaHints";

const COPY = {
  dropHint: "拖拽图片到此处，或点击选择",
  targetLabel: "转换为：",
  convert: "开始转换",
  converting: "转换中…",
  limitHint: "支持 png / jpg / jpeg / webp / bmp / gif",
} as const;

export default function Converter({
  quota,
  reloadQuota,
  lockedSource,
  lockedTarget,
}: {
  quota: QuotaSummary | null;
  reloadQuota: () => void;
  lockedSource?: string;
  lockedTarget?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(lockedTarget ?? "jpg");
  const [phase, setPhase] = useState<"idle" | "converting" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [pickError, setPickError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pathUsed, setPathUsed] = useState<"local" | "server" | null>(null);

  const locked = Boolean(lockedSource && lockedTarget);
  const busy = phase === "converting";
  const sourceExt = file ? sourceExtOf(file.name) : "";
  const effectiveTarget = lockedTarget ?? target;
  const targetOptions = TARGET_EXTS.filter(
    (t) => t !== (lockedSource ?? sourceExt)
  );
  // 预检（双保险之一，后端 429 兜底）：次数用尽或文件超单文件上限时禁用
  const quotaExhausted = !!quota && quota.used.count >= quota.limit.count;
  const oversize = !!file && !!quota && file.size > quota.limit.max_upload_bytes;
  const blocked = quotaExhausted || oversize;
  const accept = lockedSource
    ? (ACCEPT_ALIAS[lockedSource] ?? `.${lockedSource}`)
    : SOURCE_EXTS.map((e) => ACCEPT_ALIAS[e] ?? `.${e}`).join(",");

  async function handleConvert() {
    if (!file) return;
    setPhase("converting");
    setMessage("");
    try {
      // 本地优先：浏览器 Canvas 转换，文件不上传；失败自动回退服务端
      if (canConvertLocally(sourceExt, effectiveTarget, file.size)) {
        try {
          const blob = await convertLocally(file, effectiveTarget);
          setPathUsed("local");
          setDownloadUrl(URL.createObjectURL(blob));
          setDownloadName(outputName(file.name, effectiveTarget));
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
      const created = await createConversion(file, effectiveTarget);
      const info: TaskInfo = await pollUntilDone(created.task_id, created.pass_key);
      if (info.status !== "succeeded") {
        throw new Error(info.message || "转换失败");
      }
      setDownloadUrl(buildDownloadUrl(created.task_id, created.pass_key));
      setDownloadName(outputName(file.name, effectiveTarget));
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
    const allowed = lockedSource ? [lockedSource] : SOURCE_EXTS;
    if (!allowed.includes(ext)) {
      setFile(null);
      resetResult();
      setPickError(
        lockedSource
          ? `本页仅支持 ${lockedSource.toUpperCase()} 源文件，收到：${picked.name}`
          : `仅支持 ${SOURCE_EXTS.join(" / ")}，收到：${picked.name}`
      );
      return;
    }
    setFile(picked);
    setPickError("");
    resetResult();
    if (!locked && target === ext) {
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
    <>
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
          accept={accept}
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
      <p style={{ fontSize: 12, color: "#9ca3af" }}>
        {lockedSource
          ? `本页仅支持 ${lockedSource.toUpperCase()} 源文件`
          : COPY.limitHint}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {!locked && (
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
        )}
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
    </>
  );
}
