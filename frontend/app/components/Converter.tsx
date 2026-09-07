"use client";

// 转换器主体：选择文件 → 本地优先转换 → 服务端兜底；首页与 SEO 落地页共用。
// 类别感知（切片 10a）：图片互转（Canvas 本地 / 服务端兜底）与
// 文档 → PDF（服务端 LibreOffice）、md → html（本地渲染）。
// 传入 lockedSource/lockedTarget 时锁定格式（落地页场景）：隐藏目标下拉、
// 仅接受该来源格式、不自动切换目标。

import { useState } from "react";
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
  ALL_SOURCE_EXTS,
  categoryOf,
  targetOptionsFor,
  outputName,
  sourceExtOf,
} from "../lib/formats";
import ConvertResult from "./ConvertResult";
import FileDrop from "./FileDrop";
import QuotaHints from "./QuotaHints";

const COPY = {
  image: {
    dropHint: "拖拽图片到此处，或点击选择",
    limitHint: "支持 png / jpg / jpeg / webp / bmp / gif",
  },
  doc: {
    dropHint: "拖拽文档到此处，或点击选择",
    limitHint:
      "支持 doc / docx / xls / xlsx / ppt / pptx / odt / ods / odp / html / csv / txt / md",
  },
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
  const [pathUsed, setPathUsed] = useState<"local" | "server" | null>(null);

  const locked = Boolean(lockedSource && lockedTarget);
  const busy = phase === "converting";
  const sourceExt = file ? sourceExtOf(file.name) : "";
  const effectiveTarget = lockedTarget ?? target;
  // 目标下拉：锁定页不显示；首页按当前源格式的类别给出可选项
  const targetOptions = locked
    ? []
    : targetOptionsFor(lockedSource ?? sourceExt);
  // 预检（双保险之一，后端 429 兜底）：次数用尽或文件超单文件上限时禁用
  const quotaExhausted = !!quota && quota.used.count >= quota.limit.count;
  const oversize = !!file && !!quota && file.size > quota.limit.max_upload_bytes;
  const blocked = quotaExhausted || oversize;
  const accept = lockedSource
    ? (ACCEPT_ALIAS[lockedSource] ?? `.${lockedSource}`)
    : ALL_SOURCE_EXTS.map((e) => ACCEPT_ALIAS[e] ?? `.${e}`).join(",");
  const copy = COPY[categoryOf(lockedSource ?? sourceExt)];
  // md → html 仅本地渲染，服务端不支持该组合，失败时直接报错
  const localOnly = sourceExt === "md" && effectiveTarget === "html";

  async function handleConvert() {
    if (!file) return;
    setPhase("converting");
    setMessage("");
    try {
      // 本地优先：浏览器内完成，文件不上传；失败自动回退服务端（md→html 除外）
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
          if (localOnly) {
            throw new Error("本地转换失败，请检查文件编码（需 UTF-8）");
          }
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
    const allowed = lockedSource ? [lockedSource] : ALL_SOURCE_EXTS;
    if (!allowed.includes(ext)) {
      setFile(null);
      resetResult();
      setPickError(
        lockedSource
          ? `本页仅支持 ${lockedSource.toUpperCase()} 源文件，收到：${picked.name}`
          : `仅支持 ${ALL_SOURCE_EXTS.join(" / ")}，收到：${picked.name}`
      );
      return;
    }
    setFile(picked);
    setPickError("");
    resetResult();
    if (!locked) {
      const opts = targetOptionsFor(ext);
      if (!opts.includes(target)) {
        setTarget(opts[0]);
      }
    }
  }

  return (
    <>
      <FileDrop
        accept={accept}
        hint={copy.dropHint}
        busy={busy}
        onPick={applyPickedFile}
      />
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
          : copy.limitHint}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {!locked && targetOptions.length > 0 && (
          <label style={{ fontSize: 14, color: "#374151" }}>
            转换为：
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
          {busy ? "转换中…" : "开始转换"}
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
