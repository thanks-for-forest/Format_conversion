import ArchivePanel from "../components/ArchivePanel";

// 压缩包功能页：打包 + 解压完整面板（切片 9 组件化后本页只做壳）。

export default function ArchivePage() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "48px auto",
        padding: 32,
        background: "var(--card-bg)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        fontFamily: "var(--font)",
      }}
    >
      <h1 style={{ fontSize: 28, margin: 0, color: "var(--ink)" }}>压缩包打包 / 解压</h1>
      <p style={{ color: "var(--body-color)" }}>
        多个文件打包成 ZIP；或解压 ZIP / TAR.GZ。25MB 内浏览器本地完成，文件不上传。
      </p>
      <ArchivePanel />
    </main>
  );
}
