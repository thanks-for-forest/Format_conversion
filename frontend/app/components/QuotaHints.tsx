"use client";

// 配额预检提示（超额/超限红字提示，从 page 拆出以控制单文件行数）。

import type { QuotaSummary } from "../lib/api";

export default function QuotaHints({
  quota,
  oversize,
}: {
  quota: QuotaSummary;
  oversize: boolean;
}) {
  const hintStyle: React.CSSProperties = {
    marginTop: 8,
    color: "var(--danger)",
    fontSize: 13,
  };
  if (oversize) {
    const mb = Math.floor(quota.limit.max_upload_bytes / (1024 * 1024));
    return <p style={hintStyle}>文件超过当前档位单文件上限（{mb}MB）</p>;
  }
  if (quota.used.count >= quota.limit.count) {
    return (
      <p style={hintStyle}>
        {`今日转换次数已用完，UTC 零点重置${
          quota.authenticated ? "" : "，登录后每日额度更高"
        }`}
      </p>
    );
  }
  return null;
}
