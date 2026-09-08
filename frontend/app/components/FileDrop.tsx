"use client";

// 拖拽 / 点击选文件区（切片 12a 换装，借鉴 TinyPNG：白色大虚线区 + 大字引导）。
// 首页与落地页共用；accept 与提示文案由调用方按类别传入，多/单文件分支由调用方处理。
// input 以透明层覆盖整个区域：点击任意位置即打开选择器，且对键盘/自动化工具可见。

import { useState, type DragEvent } from "react";

export default function FileDrop({
  accept,
  hint,
  busy,
  onPick,
}: {
  accept: string;
  hint: string;
  busy: boolean;
  onPick: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    onPick(Array.from(e.dataTransfer.files));
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        display: "block",
        position: "relative",
        margin: "8px 0 8px",
        padding: "40px 16px 32px",
        borderRadius: "var(--r-sm)",
        border: dragging ? "2px dashed var(--brand)" : "2px dashed var(--line)",
        background: dragging ? "var(--brand-soft)" : "var(--card-bg)",
        textAlign: "center",
        cursor: busy ? "wait" : "pointer",
        transition: "border-color .15s, background .15s",
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          onPick(Array.from(e.target.files ?? []));
          e.target.value = ""; // 清空以便下次选择同一文件仍触发 change
        }}
        disabled={busy}
        style={{
          // 12px 微型透明层：整块区域点击由 label 转发触发选择器；
          // 保留微小可交互面，便于自动化测试与部分辅助技术定位 input
          position: "absolute",
          top: 6,
          right: 6,
          width: 12,
          height: 12,
          opacity: 0.01,
          cursor: busy ? "wait" : "pointer",
        }}
      />
      <strong style={{ display: "block", fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>
        拖拽文件到此处，或点击选择
      </strong>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</span>
    </label>
  );
}
