import ArchivePanel from "../components/ArchivePanel";

// 压缩包功能页：打包 + 解压完整面板（切片 9 组件化后本页只做壳）。

export default function ArchivePage() {
  return (
    <main
      style={{
        maxWidth: 520,
        margin: "80px auto",
        padding: 32,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, margin: 0 }}>压缩包打包 / 解压</h1>
      <p style={{ color: "#6b7280" }}>
        多个文件打包成 ZIP；或解压 ZIP / TAR.GZ。25MB 内浏览器本地完成，文件不上传。
      </p>
      <ArchivePanel />
    </main>
  );
}
