"use client";

// 同名文件冲突决策弹窗（累积选择时触发）：覆盖旧文件 / 自动重命名 / 取消。

export default function DuplicateModal({
  names,
  onOverwrite,
  onRename,
  onCancel,
}: {
  names: string[];
  onOverwrite: () => void;
  onRename: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          maxWidth: 340,
          width: "90%",
          boxShadow: "0 10px 30px rgba(0,0,0,.15)",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#111827" }}>
          出现同名文件，请核实
        </h3>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
          已选择列表中存在同名文件：
          <br />
          <strong style={{ color: "#111827" }}>{names.join("、")}</strong>
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            跳过新文件
          </button>
          <button
            onClick={onRename}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            自动重命名
          </button>
          <button
            onClick={onOverwrite}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            覆盖旧文件
          </button>
        </div>
      </div>
    </div>
  );
}
