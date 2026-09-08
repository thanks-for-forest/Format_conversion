"use client";

// 转换器入口薄壳（切片 10c）：多选自适应——选 1 个文件走 SingleConverter，
// 选 ≥2 个同类文件进入 BatchQueue 批量队列。文件选择/类别校验/目标状态在此，
// 转换执行与结果展示在子组件。落地页 locked 模式同样支持批量（同源格式）。
// 选择为累积式（v0.22.2）：逐文件追加 + 单项移除 + 清空；同名触发决策弹窗。

import { useState } from "react";
import type { QuotaSummary } from "../lib/api";
import {
  ALL_SOURCE_EXTS,
  ACCEPT_ALIAS,
  categoryOf,
  targetOptionsFor,
  sourceExtOf,
} from "../lib/formats";
import BatchQueue from "./BatchQueue";
import DuplicateModal from "./DuplicateModal";
import FileDrop from "./FileDrop";
import FilePreviewModal from "./FilePreviewModal";
import PickedFiles from "./PickedFiles";
import SingleConverter from "./SingleConverter";

interface DupConflict {
  names: string[];
  files: File[];
  base: File[]; // 决策基准：非冲突文件已就位的选择列表
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
  const [dup, setDup] = useState<DupConflict | null>(null); // 同名冲突待决策
  const [previewIdx, setPreviewIdx] = useState<number | null>(null); // 内容预览浮层

  const locked = Boolean(lockedSource && lockedTarget);
  const accept = lockedSource
    ? (ACCEPT_ALIAS[lockedSource] ?? `.${lockedSource}`)
    : ALL_SOURCE_EXTS.map((e) => ACCEPT_ALIAS[e] ?? `.${e}`).join(",");
  const firstExt = picked.length > 0 ? sourceExtOf(picked[0].name) : "";
  const targetOptions = locked && lockedTarget ? [lockedTarget] : targetOptionsFor(firstExt);

  // 累积选择：新文件逐个校验后追加，不覆盖已有选择。
  // 规则：锁定页仅同锁定源；同类文件可累积（首个文件定类别）；
  // doc 类禁止 md 与 Office 文档混选；同名文件挂起并弹窗请用户决策。
  function appendPicked(incoming: File[]) {
    if (incoming.length === 0) return;
    const base = picked[0] ?? incoming[0];
    const baseCat = categoryOf(sourceExtOf(base.name));
    const effective = [...picked];
    const rejected: string[] = [];
    const dupNames: string[] = [];
    const dupFiles: File[] = [];
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
      if (effective.some((p) => p.name === f.name)) {
        dupNames.push(f.name);
        dupFiles.push(f);
        continue;
      }
      effective.push(f);
    }
    if (rejected.length > 0) {
      setPickError(`已忽略 ${rejected.length} 个文件：${rejected.join("、")}`);
    } else {
      setPickError("");
    }
    if (dupFiles.length > 0) {
      // 非冲突文件先入列；同名项挂起等用户决策（覆盖 / 自动重命名 / 跳过）
      setPicked(effective);
      setPickSeq((n) => n + 1);
      syncTarget(sourceExtOf(effective[0].name));
      setDup({ names: dupNames, files: dupFiles, base: effective });
      return;
    }
    setPicked(effective);
    setPickSeq((n) => n + 1);
    syncTarget(sourceExtOf(effective[0].name));
  }

  // 同名决策：覆盖旧文件 / 自动重命名（a(1).ext 递增）/ 跳过新文件
  function resolveDup(mode: "overwrite" | "rename" | "skip") {
    if (!dup) return;
    const effective = [...dup.base];
    for (const file of dup.files) {
      if (mode === "overwrite") {
        const idx = effective.findIndex((p) => p.name === file.name);
        if (idx >= 0) effective[idx] = file;
        continue;
      }
      if (mode === "rename") {
        // File.name 只读：用 new File([原文件], 新名) 包装，内容零拷贝
        const names = new Set(effective.map((p) => p.name));
        const dot = file.name.lastIndexOf(".");
        const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
        const ext = dot > 0 ? file.name.slice(dot) : "";
        let i = 1;
        while (names.has(`${stem}(${i})${ext}`)) i++;
        const newName = `${stem}(${i})${ext}`;
        effective.push(
          new File([file], newName, {
            type: file.type,
            lastModified: file.lastModified,
          })
        );
      }
      // skip：丢弃新文件
    }
    setPicked(effective);
    setPickSeq((n) => n + 1);
    setDup(null);
  }

  function removeAt(idx: number) {
    if (childBusy) return;
    const next = picked.filter((_, i) => i !== idx);
    setPicked(next);
    setPickError("");
    setPickSeq((n) => n + 1);
    // 移除最后一个文件时 next 为空数组，须与 clearPicked 同样做空值防护
    syncTarget(sourceExtOf(next[0]?.name ?? ""));
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
        <PickedFiles
          files={picked}
          busy={childBusy}
          onRemove={removeAt}
          onClear={clearPicked}
          onPreview={setPreviewIdx}
        />
      )}
      {pickError && (
        <p style={{ margin: "0 0 8px", color: "#dc2626" }}>{pickError}</p>
      )}

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

      {dup && (
        <DuplicateModal
          names={dup.names}
          onOverwrite={() => resolveDup("overwrite")}
          onRename={() => resolveDup("rename")}
          onCancel={() => resolveDup("skip")}
        />
      )}

      {previewIdx !== null && picked[previewIdx] && (
        <FilePreviewModal
          key={`${picked[previewIdx].name}-${previewIdx}`}
          file={picked[previewIdx]}
          onClose={() => setPreviewIdx(null)}
        />
      )}
    </>
  );
}
