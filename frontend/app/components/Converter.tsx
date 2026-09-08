"use client";

// 转换器入口薄壳（切片 10c）：多选自适应——选 1 个文件走 SingleConverter，
// 选 ≥2 个同类文件进入 BatchQueue 批量队列。文件选择/类别校验/目标状态在此，
// 转换执行与结果展示在子组件。落地页 locked 模式同样支持批量（同源格式）。

import { useState } from "react";
import type { QuotaSummary } from "../lib/api";
import { ALL_SOURCE_EXTS, ACCEPT_ALIAS, categoryOf, targetOptionsFor, sourceExtOf } from "../lib/formats";
import BatchQueue from "./BatchQueue";
import FileDrop from "./FileDrop";
import SingleConverter from "./SingleConverter";

// 文件大小展示（批量清单用）
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [picked, setPicked] = useState<File[]>([]);
  const [pickSeq, setPickSeq] = useState(0); // 变更即重建子组件，天然重置结果状态
  const [pickError, setPickError] = useState("");
  const [target, setTarget] = useState(lockedTarget ?? "jpg");
  const [childBusy, setChildBusy] = useState(false); // 单/批转换运行态（禁换文件防孤儿请求）

  const locked = Boolean(lockedSource && lockedTarget);
  const accept = lockedSource
    ? (ACCEPT_ALIAS[lockedSource] ?? `.${lockedSource}`)
    : ALL_SOURCE_EXTS.map((e) => ACCEPT_ALIAS[e] ?? `.${e}`).join(",");
  const firstExt = picked.length > 0 ? sourceExtOf(picked[0].name) : "";
  const targetOptions = locked && lockedTarget ? [lockedTarget] : targetOptionsFor(firstExt);

  // 累积选择（切片 10c 反馈）：新文件逐个校验后追加，不覆盖已有选择。
  // 规则：锁定页仅同锁定源；同类文件可累积（首个文件定类别）；
  // doc 类禁止 md 与 Office 文档混选；同名文件视为替换。
  function appendPicked(incoming: File[]) {
    if (incoming.length === 0) return;
    const base = picked[0] ?? incoming[0];
    const baseCat = categoryOf(sourceExtOf(base.name));
    const effective = [...picked];
    const rejected: string[] = [];
    for (const f of incoming) {
      const ext = sourceExtOf(f.name);
      const cat = categoryOf(ext);
      const allowedExt = lockedSource
        ? ext === lockedSource
        : ALL_SOURCE_EXTS.includes(ext);
      if (!allowedExt) {
        rejected.push(f.name);
        continue;
      }
      if (effective.length > 0 && cat !== baseCat) {
        rejected.push(f.name);
        continue;
      }
      if (cat === "doc") {
        // md 仅支持本地转 HTML，与 Office 文档（服务端转 PDF）路由不同，不得混批
        const fIsMd = ext === "md";
        const hasMd = effective.some((p) => sourceExtOf(p.name) === "md");
        const hasNonMd = effective.some((p) => sourceExtOf(p.name) !== "md");
        if ((hasMd && !fIsMd) || (hasNonMd && fIsMd)) {
          rejected.push(f.name);
          continue;
        }
      }
      const dupIdx = effective.findIndex((p) => p.name === f.name);
      if (dupIdx >= 0) effective[dupIdx] = f;
      else effective.push(f);
    }
    if (rejected.length > 0) {
      setPickError(`已忽略 ${rejected.length} 个文件：${rejected.join("、")}`);
    } else {
      setPickError("");
    }
    setPicked(effective);
    setPickSeq((n) => n + 1);
    syncTarget(sourceExtOf(effective[0].name));
  }

  function removeAt(idx: number) {
    if (childBusy) return;
    const next = picked.filter((_, i) => i !== idx);
    setPicked(next);
    setPickError("");
    setPickSeq((n) => n + 1);
    syncTarget(sourceExtOf(next[0].name));
  }

  function clearPicked() {
    if (childBusy) return;
    setPicked([]);
    setPickError("");
    setPickSeq((n) => n + 1);
    syncTarget(sourceExtOf(picked[0]?.name ?? ""));
  }

  function syncTarget(ext: string) {
    const options = targetOptionsFor(ext);
    if (!options.includes(target)) {
      setTarget(options[0]);
    }
  }

  const effectiveTarget = lockedTarget ?? target;

  return (
    <>
      <FileDrop
        accept={accept}
        hint={
          lockedSource
            ? "可多选同格式文件批量转换"
            : "拖拽文件到此处，或点击选择（可多次追加同类文件批量转换）"
        }
        busy={childBusy}
        onPick={appendPicked}
      />
      {picked.length > 0 && (
        <div style={{ margin: "0 0 8px" }}>
          <p
            style={{
              fontSize: 14,
              margin: "0 0 4px",
              color: "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              已选 {picked.length} 个文件
              {picked.length > 1 ? "（批量模式）" : ""}
            </span>
            {!childBusy && (
              <button
                onClick={clearPicked}
                style={{
                  border: "none",
                  background: "none",
                  color: "#9ca3af",
                  fontSize: 12,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                清空
              </button>
            )}
          </p>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: "4px 8px",
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              borderRadius: 8,
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {picked.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "2px 0",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={f.name}
                >
                  {f.name}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ color: "#9ca3af" }}>{formatSize(f.size)}</span>
                  {!childBusy && (
                    <button
                      onClick={() => removeAt(i)}
                      title="移除该文件"
                      style={{
                        border: "none",
                        background: "none",
                        color: "#dc2626",
                        fontSize: 13,
                        lineHeight: 1,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pickError && (
        <p style={{ margin: "0 0 8px", color: "#dc2626" }}>{pickError}</p>
      )}
      <p style={{ fontSize: 12, color: "#9ca3af" }}>
        {lockedSource
          ? `本页仅支持 ${lockedSource.toUpperCase()} 源文件`
          : "支持 png / jpg / webp / bmp / gif / doc / docx / xls / xlsx / ppt / pptx / odt / ods / odp / html / csv / txt / md / mp3 / wav / flac / aac / ogg / m4a / mp4 / mov / mkv / webm / avi"}
      </p>

      {picked.length === 1 && (
        <SingleConverter
          key={`s-${pickSeq}`}
          file={picked[0]}
          target={effectiveTarget}
          onTargetChange={setTarget}
          targetOptions={targetOptions}
          quota={quota}
          reloadQuota={reloadQuota}
          onBusyChange={setChildBusy}
        />
      )}
      {picked.length > 1 && (
        <BatchQueue
          key={`b-${pickSeq}`}
          files={picked}
          target={effectiveTarget}
          onTargetChange={setTarget}
          targetOptions={targetOptions}
          quota={quota}
          reloadQuota={reloadQuota}
          onBusyChange={setChildBusy}
        />
      )}
    </>
  );
}
