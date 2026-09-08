"use client";

// 拖拽 / 点击选文件区（支持多选）：首页与落地页共用；
// accept 与提示文案由调用方按类别传入，多/单文件分支由调用方处理。

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

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    onPick(Array.from(e.dataTransfer.files));
  }

  return (
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
        multiple
        onChange={(e) => onPick(Array.from(e.target.files ?? []))}
        disabled={busy}
        style={{ display: "block", margin: "0 auto" }}
      />
      <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0 0" }}>{hint}</p>
    </div>
  );
}
