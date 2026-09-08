"use client";

// 单文件转换器（切片 10c 从 Converter 拆出）：本地优先 → 服务端兜底。
// 文件选择与目标下拉由上层（Converter 薄壳）管理，本组件只负责转换与结果。

import { useEffect, useState } from "react";
import {
  buildDownloadUrl,
  createConversion,
  pollUntilDone,
  reportLocalCount,
  type QuotaSummary,
  type TaskInfo,
} from "../lib/api";
import { canConvertLocally, convertLocally } from "../lib/convert";
import { outputName, sourceExtOf } from "../lib/formats";
import ConvertResult from "./ConvertResult";
import QuotaHints from "./QuotaHints";

const COPY = {
  convert: "开始转换",
  converting: "转换中…",
} as const;

export default function SingleConverter({
  file,
  target,
  onTargetChange,
  targetOptions,
  quota,
  reloadQuota,
  onBusyChange,
}: {
  file: File;
  target: string;
  onTargetChange: (t: string) => void;
  targetOptions: string[];
  quota: QuotaSummary | null;
  reloadQuota: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "converting" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [pathUsed, setPathUsed] = useState<"local" | "server" | null>(null);

  const busy = phase === "converting";
  const sourceExt = sourceExtOf(file.name);
  // md → html 仅本地渲染，服务端不支持该组合，失败时直接报错
  const localOnly = sourceExt === "md" && target === "html";
  // 预检（双保险之一，后端 429 兜底）：次数用尽或文件超单文件上限时禁用
  const quotaExhausted = !!quota && quota.used.count >= quota.limit.count;
  const oversize = !!quota && file.size > quota.limit.max_upload_bytes;
  const blocked = quotaExhausted || oversize;

  // 运行态上抛：上层禁用文件选择，避免转换中换文件产生孤儿请求白扣配额
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  async function handleConvert() {
    setPhase("converting");
    setMessage("");
    try {
      // 本地优先：浏览器内完成，文件不上传；失败自动回退服务端（md→html 除外）
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
          if (localOnly) {
            throw new Error("本地转换失败，请检查文件编码（需 UTF-8）");
          }
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
                resetResult();
              }}
              disabled={busy}
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
          disabled={busy || blocked}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: busy || blocked ? "#c7cdd4" : "#2563eb",
            color: "#fff",
            cursor: busy || blocked ? "not-allowed" : "pointer",
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
