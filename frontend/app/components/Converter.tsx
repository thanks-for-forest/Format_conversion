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

  function applyPicked(fs: File[]) {
    if (fs.length === 0) {
      setPicked([]);
      setPickError("");
      setPickSeq((n) => n + 1);
      return;
    }
    if (fs.length === 1) {
      // 单文件：白名单校验（与既有行为一致）
      const ext = sourceExtOf(fs[0].name);
      const allowed = lockedSource ? [lockedSource] : ALL_SOURCE_EXTS;
      if (!allowed.includes(ext)) {
        setPicked([]);
        setPickError(
          lockedSource
            ? `本页仅支持 ${lockedSource.toUpperCase()} 源文件，收到：${fs[0].name}`
            : `仅支持 ${ALL_SOURCE_EXTS.join(" / ")}，收到：${fs[0].name}`
        );
        setPickSeq((n) => n + 1);
        return;
      }
    } else {
      // 批量：落地页须与锁定源一致；首页须同类且文档批不混 md（md 与 Office 路由不同）
      const bad = lockedSource
        ? fs.filter((f) => sourceExtOf(f.name) !== lockedSource)
        : fs.filter((f) => categoryOf(sourceExtOf(f.name)) !== categoryOf(sourceExtOf(fs[0].name)));
      const docMixed =
        !lockedSource &&
        categoryOf(sourceExtOf(fs[0].name)) === "doc" &&
        fs.some((f) => sourceExtOf(f.name) === "md") &&
        fs.some((f) => sourceExtOf(f.name) !== "md");
      if (bad.length > 0 || docMixed) {
        setPicked([]);
        setPickError(
          docMixed
            ? "批量暂不支持 md 与其他文档混选：md 仅支持转 HTML，请分开批量"
            : `批量仅支持同类文件（${
                lockedSource ? `本页仅限 ${lockedSource.toUpperCase()}` : "首个文件的类别"
              }），收到：${bad.map((f) => f.name).join("、") || "混合类别文件"}`
        );
        setPickSeq((n) => n + 1);
        return;
      }
    }
    setPicked(fs);
    setPickError("");
    setPickSeq((n) => n + 1);
    // 目标自动适配：当前目标不在该类别可选项时切到第一个
    const options = targetOptionsFor(sourceExtOf(fs[0].name));
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
            : "拖拽文件到此处，或点击选择（可多选同类文件批量转换）"
        }
        busy={childBusy}
        onPick={applyPicked}
      />
      {picked.length === 1 && (
        <p style={{ fontSize: 14, margin: "0 0 8px", color: "#111827" }}>
          已选：{picked[0].name}
        </p>
      )}
      {picked.length > 1 && (
        <p style={{ fontSize: 14, margin: "0 0 8px", color: "#111827" }}>
          已选 {picked.length} 个文件（批量模式）
        </p>
      )}
      {pickError && (
        <p style={{ margin: "0 0 8px", color: "#dc2626" }}>{pickError}</p>
      )}
      <p style={{ fontSize: 12, color: "#9ca3af" }}>
        {lockedSource
          ? `本页仅支持 ${lockedSource.toUpperCase()} 源文件`
          : "支持 png / jpg / jpeg / webp / bmp / gif / doc / docx / xls / xlsx / ppt / pptx / odt / ods / odp / html / csv / txt / md / mp3 / wav / flac / aac / ogg / m4a"}
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
