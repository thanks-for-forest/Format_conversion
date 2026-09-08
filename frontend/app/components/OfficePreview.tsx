"use client";

// Office 文档预览（切片 11a）：调服务端 soffice 转 PDF 回传，iframe 内嵌显示。
// 生成需数秒，分 loading / ready / error 三态；AbortController 防卸载后 setState，
// StrictMode 双挂载下首次请求被中止后重建（blob URL 教训：资源生命周期全放 effect）。

import { useEffect, useState } from "react";
import { ApiStatusError, previewOffice } from "../lib/api";

export default function OfficePreview({ file }: { file: File }) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    let url = "";
    previewOffice(file, ctrl.signal)
      .then((blob) => {
        if (ctrl.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState("error");
        setErrMsg(
          e instanceof ApiStatusError ? e.message : "预览生成失败，请重试"
        );
      });
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  if (state === "loading") {
    return (
      <p style={{ fontSize: 13, color: "#6b7280", textAlign: "center", margin: 0 }}>
        正在生成预览…（首次需数秒）
      </p>
    );
  }
  if (state === "error") {
    return (
      <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>
        <p style={{ margin: "0 0 6px", color: "#dc2626" }}>{errMsg}</p>
        <p style={{ margin: 0 }}>可直接开始转换。</p>
      </div>
    );
  }
  return (
    <iframe
      src={pdfUrl}
      title={`预览 ${file.name}`}
      style={{
        width: "100%",
        height: "60vh",
        border: "none",
        borderRadius: 8,
      }}
    />
  );
}
