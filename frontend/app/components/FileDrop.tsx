"use client";

// 拖拽 / 点击选文件区：首页与落地页共用；accept 与提示文案由调用方按类别传入。

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
  onPick: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    onPick(e.dataTransfer.files?.[0] ?? null);
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
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        disabled={busy}
        style={{ display: "block", margin: "0 auto" }}
      />
      <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0 0" }}>{hint}</p>
    </div>
  );
}
