"use client";

// 已选文件清单（累积选择）：文件名 + 大小 + 单项移除 + 清空。
// 只读展示由上层状态驱动；转换运行中上层会禁用移除/清空。

// 文件大小展示（清单用）
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 按扩展名取类型图标（清单项一眼识别文件类别）
const TYPE_ICONS: Record<string, string> = {
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", webp: "🖼️", bmp: "🖼️", gif: "🎞️",
  doc: "📄", docx: "📄", odt: "📄", txt: "📝", md: "📝", html: "🌐",
  xls: "📊", xlsx: "📊", csv: "📊",
  ppt: "📽️", pptx: "📽️", odp: "📽️",
  mp3: "🎵", wav: "🎵", flac: "🎵", aac: "🎵", ogg: "🎵", m4a: "🎵",
  mp4: "🎬", mov: "🎬", mkv: "🎬", webm: "🎬", avi: "🎬",
  zip: "🗜️", gz: "🗜️",
};

function typeIcon(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return TYPE_ICONS[ext] ?? "📁";
}

export default function PickedFiles({
  files,
  busy,
  onRemove,
  onClear,
  onPreview,
}: {
  files: File[];
  busy: boolean;
  onRemove: (idx: number) => void;
  onClear: () => void;
  onPreview: (idx: number) => void;
}) {
  return (
    <div style={{ margin: "0 0 8px" }}>
      <p
        style={{
          fontSize: 14,
          margin: "0 0 4px",
          color: "var(--ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          已选 {files.length} 个文件
          {files.length > 1 ? "（批量模式）" : ""}
        </span>
        {!busy && (
          <button
            onClick={onClear}
            style={{
              border: "none",
              background: "none",
              color: "var(--muted)",
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
          color: "var(--body-color)",
          background: "var(--page-bg)",
          borderRadius: 8,
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {files.map((f, i) => (
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
                minWidth: 0,
              }}
            >
              <button
                onClick={() => onPreview(i)}
                title={`预览 ${f.name}`}
                style={{
                  border: "none",
                  background: "none",
                  padding: 0,
                  fontSize: 12,
                  color: "var(--brand)",
                  fontWeight: 600,
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
              >
                {typeIcon(f.name)} {f.name}
              </button>
            </span>
            <span
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ color: "var(--muted)" }}>{formatSize(f.size)}</span>
              {!busy && (
                <button
                  onClick={() => onRemove(i)}
                  title="移除该文件"
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--danger)",
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
  );
}
