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
        background: "rgba(18,20,29,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: "var(--r-md)",
          padding: 20,
          maxWidth: 340,
          width: "90%",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--ink)" }}>
          出现同名文件，请核实
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
          已选择列表中存在同名文件：
          <br />
          <strong style={{ color: "var(--ink)" }}>{names.join("、")}</strong>
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
              padding: "8px 14px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--line)",
              background: "var(--card-bg)",
              color: "var(--body-color)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            跳过新文件
          </button>
          <button
            onClick={onRename}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--brand)",
              background: "var(--card-bg)",
              color: "var(--brand)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            自动重命名
          </button>
          <button
            onClick={onOverwrite}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--r-sm)",
              border: "none",
              background: "var(--brand)",
              color: "#fff",
              fontWeight: 600,
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
