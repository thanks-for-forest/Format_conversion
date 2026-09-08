"use client";

// 压缩包面板（切片 8 实现，切片 9 组件化供多页复用）：
// 打包（多文件→ZIP）与解压（ZIP/TAR.GZ→文件列表）。
// 本地引擎优先（lib/archive.ts，文件不上传），>25MB 或失败回退服务端；
// 服务端把解压统一重打包为 ZIP 交付。配额与转换同口径。
// 页面壳负责 <main>/标题/SEO 文案，本组件只渲染功能主体。

import { useRef, useState } from "react";
import {
  extractArchive,
  logout,
  packFiles,
  reportLocalCount,
} from "../lib/api";
import {
  isGzip,
  isZip,
  tarGzUnpack,
  zipPack,
  zipUnpack,
  type ArchiveEntry,
} from "../lib/archive";
import AuthBar from "./AuthBar";
import { useQuota } from "../lib/useQuota";

const LOCAL_MAX = 25 * 1024 * 1024;

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const buttonStyle: React.CSSProperties = {
  marginLeft: 8,
  padding: "8px 16px",
  borderRadius: "var(--r-md)",
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
};

export default function ArchivePanel() {
  const { user, setUser, quota, reloadQuota } = useQuota();
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [pathUsed, setPathUsed] = useState<"local" | "server" | null>(null);
  const [busy, setBusy] = useState(false);
  const packInput = useRef<HTMLInputElement>(null);
  const extractInput = useRef<HTMLInputElement>(null);

  const blocked = !!quota && quota.used.count >= quota.limit.count;
  const handleLogout = () =>
    logout()
      .then(() => setUser(null))
      .finally(reloadQuota);

  async function afterLocalWork(): Promise<void> {
    setPathUsed("local");
    reportLocalCount()
      .then(reloadQuota)
      .catch(() => {});
  }

  async function handlePack(): Promise<void> {
    const files = Array.from(packInput.current?.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setMessage("处理中…");
    setEntries([]);
    setPathUsed(null);
    const total = files.reduce((sum, f) => sum + f.size, 0);
    try {
      if (total <= LOCAL_MAX) {
        const contents = await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            data: new Uint8Array(await f.arrayBuffer()),
          }))
        );
        downloadBlob(zipPack(contents), "archive.zip");
        await afterLocalWork();
        setMessage(`打包完成（本地处理，文件未上传）：${files.length} 个文件`);
        return;
      }
      const blob = await packFiles(files);
      downloadBlob(blob, "archive.zip");
      setPathUsed("server");
      reloadQuota();
      setMessage("打包完成（服务端处理）");
    } catch (err) {
      setPathUsed(null);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleExtract(): Promise<void> {
    const file = extractInput.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("处理中…");
    setEntries([]);
    setPathUsed(null);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (file.size <= LOCAL_MAX) {
        const list = isZip(data)
          ? await zipUnpack(data)
          : isGzip(data)
            ? await tarGzUnpack(data)
            : (() => {
                throw new Error("仅支持 zip / tar.gz 压缩包");
              })();
        await afterLocalWork();
        setEntries(list);
        setMessage(`解压完成（本地处理，文件未上传）：${list.length} 个文件`);
        return;
      }
      const blob = await extractArchive(file);
      downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}.zip`);
      setPathUsed("server");
      reloadQuota();
      setMessage("解压完成（服务端处理，已重打包为 ZIP）");
    } catch (err) {
      setPathUsed(null);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthBar user={user} quota={quota} onLogout={handleLogout} />

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>打包为 ZIP</h2>
        <input ref={packInput} type="file" multiple onChange={() => setMessage("")} />
        <button onClick={handlePack} disabled={busy || blocked} style={buttonStyle}>
          打包下载
        </button>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>解压 ZIP / TAR.GZ</h2>
        <input
          ref={extractInput}
          type="file"
          accept=".zip,.tar.gz,.tgz"
          onChange={() => setMessage("")}
        />
        <button onClick={handleExtract} disabled={busy || blocked} style={buttonStyle}>
          解压
        </button>
        {entries.length > 0 && (
          <ul style={{ marginTop: 12, paddingLeft: 20, fontSize: 14 }}>
            {entries.map((e) => (
              <li key={e.name} style={{ marginBottom: 4 }}>
                <a
                  href={URL.createObjectURL(new Blob([e.data as BlobPart]))}
                  download={e.name}
                  style={{ color: "var(--brand)", fontWeight: 600 }}
                  onClick={(ev) => {
                    // 点击后延迟回收 object URL（下载已触发）
                    const url = (ev.target as HTMLAnchorElement).href;
                    setTimeout(() => URL.revokeObjectURL(url), 10_000);
                  }}
                >
                  {e.name}
                </a>
                <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                  {(e.data.length / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p
          style={{
            marginTop: 12,
            fontSize: 14,
            color: message.includes("完成") ? "var(--brand)" : "var(--danger)",
          }}
        >
          {message}
          {pathUsed && (
            <span style={{ color: "var(--muted)" }}>
              {" "}
              · {pathUsed === "local" ? "本地（文件未上传）" : "服务端"}
            </span>
          )}
        </p>
      )}
      {blocked && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>
          今日次数已用完，明日重置（每日 UTC 零点）。
        </p>
      )}
    </>
  );
}
