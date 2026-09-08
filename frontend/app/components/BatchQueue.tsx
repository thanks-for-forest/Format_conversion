"use client";

// 批量转换队列（切片 10c）：逐个串行转换 → 结果列表 → 一键打包 ZIP 下载。
// 队列逻辑在 lib/batch.ts；本组件负责目标选择、进度展示与打包交互。

import { useEffect, useState } from "react";
import { packFiles, type QuotaSummary } from "../lib/api";
import { type BatchItem, collectResults, runBatch } from "../lib/batch";

const STATUS_TEXT: Record<BatchItem["status"], string> = {
  pending: "等待转换",
  converting: "转换中…",
  done: "完成",
  error: "失败",
  skipped: "跳过",
};

const STATUS_COLOR: Record<BatchItem["status"], string> = {
  pending: "#9ca3af",
  converting: "#2563eb",
  done: "#16a34a",
  error: "#dc2626",
  skipped: "#9ca3af",
};

export default function BatchQueue({
  files,
  target,
  onTargetChange,
  targetOptions,
  quota,
  reloadQuota,
  onBusyChange,
}: {
  files: File[];
  target: string;
  onTargetChange: (t: string) => void;
  targetOptions: string[];
  quota: QuotaSummary | null;
  reloadQuota: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<BatchItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [packUrl, setPackUrl] = useState("");
  const [packing, setPacking] = useState(false);
  const [packError, setPackError] = useState("");

  // 运行态上抛：上层禁用文件选择，避免批量中换文件产生孤儿请求白扣配额
  useEffect(() => {
    onBusyChange(running);
  }, [running, onBusyChange]);

  const doneCount = items?.filter((it) => it.status === "done").length ?? 0;
  const finished = items !== null && !running;
  // 预检：配额用尽或任一文件超单文件上限时禁用
  const quotaExhausted = !!quota && quota.used.count >= quota.limit.count;
  const oversize = !!quota && files.some((f) => f.size > quota.limit.max_upload_bytes);
  const blocked = quotaExhausted || oversize;

  async function handleStart() {
    setRunning(true);
    setPackUrl("");
    setPackError("");
    setItems(files.map((file) => ({ file, status: "pending", message: "等待转换" })));
    await runBatch(files, target, {
      onUpdate: setItems,
      onQuotaChange: reloadQuota,
    });
    setRunning(false);
  }

  async function handlePack() {
    if (!items) return;
    setPacking(true);
    setPackError("");
    try {
      const results = collectResults(items);
      // 逐个拉取结果内容（blob: 或签名下载 URL），下载即删的服务端文件从此刻起失效
      const blobs = await Promise.all(
        results.map(async (r) => {
          const resp = await fetch(r.url);
          if (!resp.ok) throw new Error(`${r.name} 下载失败（${resp.status}）`);
          return new File([await resp.blob()], r.name);
        })
      );
      const zip = await packFiles(blobs);
      setPackUrl((prev) => {
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(zip);
      });
    } catch (err) {
      setPackError(err instanceof Error ? err.message : String(err));
    } finally {
      setPacking(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {targetOptions.length > 0 && (
          <label style={{ fontSize: 14, color: "#374151" }}>
            转换为：
            <select
              value={target}
              onChange={(e) => {
                onTargetChange(e.target.value);
                setItems(null);
                setPackUrl("");
              }}
              disabled={running}
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
          onClick={handleStart}
          disabled={running || blocked}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: running || blocked ? "#c7cdd4" : "#2563eb",
            color: "#fff",
            cursor: running || blocked ? "not-allowed" : "pointer",
          }}
        >
          {running ? "批量转换中…" : `批量转换（${files.length} 个）`}
        </button>
      </div>

      {items && (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", fontSize: 13 }}>
          {items.map((it, i) => (
            <li
              key={`${it.file.name}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={it.file.name}
              >
                {it.file.name}
              </span>
              <span style={{ flexShrink: 0, color: STATUS_COLOR[it.status] }}>
                {it.status === "done" && it.url ? (
                  <a href={it.url} download={it.name} style={{ color: "#2563eb" }}>
                    下载 {it.name}
                  </a>
                ) : (
                  `${STATUS_TEXT[it.status]}${it.message ? ` · ${it.message}` : ""}`
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {finished && doneCount > 1 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={handlePack}
            disabled={packing}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              cursor: packing ? "wait" : "pointer",
            }}
          >
            {packing ? "打包中…" : `打包下载全部（${doneCount} 个 ZIP）`}
          </button>
          {packUrl && (
            <a
              href={packUrl}
              download="batch-converted.zip"
              style={{ marginLeft: 12, fontSize: 14, color: "#16a34a" }}
            >
              保存 batch-converted.zip
            </a>
          )}
          {packError && <p style={{ color: "#dc2626", fontSize: 13 }}>{packError}</p>}
        </div>
      )}
    </>
  );
}
