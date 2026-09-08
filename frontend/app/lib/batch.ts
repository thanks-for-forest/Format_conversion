// 批量转换队列（切片 10c）：逐个串行执行，本地优先，服务端兜底。
// 配额 429 中断整队（后续标跳过）；单文件失败不阻断其余；同格式跳过。

import {
  ApiStatusError,
  buildDownloadUrl,
  createConversion,
  pollUntilDone,
  reportLocalCount,
} from "./api";
import { canConvertLocally, convertLocally } from "./convert";
import { outputName, sourceExtOf } from "./formats";

export interface BatchItem {
  file: File;
  status: "pending" | "converting" | "done" | "error" | "skipped";
  message: string; // 结果说明或错误原因
  url?: string; // blob: 或签名下载 URL（done 时有值）
  name?: string; // 结果文件名
  path?: "local" | "server";
}

export interface BatchEvents {
  /** 每完成/更新一项回调（携带最新数组副本，便于 React setState） */
  onUpdate: (items: BatchItem[]) => void;
  /** 每项服务端转换成功或本地计次上报后刷新配额 */
  onQuotaChange: () => void;
}

// 结果收集（打包下载用）
export interface BatchResult {
  name: string;
  url: string;
}

function itemDone(item: BatchItem, url: string, name: string, path: "local" | "server"): BatchItem {
  return { ...item, status: "done", message: "完成", url, name, path };
}

/** 单个文件转单个目标格式；返回更新后的 item（不修改入参）。 */
async function convertOne(item: BatchItem, target: string): Promise<BatchItem> {
  const ext = sourceExtOf(item.file.name);
  if (ext === target) {
    return { ...item, status: "skipped", message: "与目标格式相同，已跳过" };
  }
  if (canConvertLocally(ext, target, item.file.size)) {
    const blob = await convertLocally(item.file, target);
    reportLocalCount().catch(() => undefined); // 本地计次不计流量，失败不影响结果
    return itemDone(item, URL.createObjectURL(blob), outputName(item.file.name, target), "local");
  }
  const created = await createConversion(item.file, target);
  const info = await pollUntilDone(created.task_id, created.pass_key);
  if (info.status !== "succeeded") {
    return { ...item, status: "error", message: info.message || "转换失败" };
  }
  return itemDone(
    item,
    buildDownloadUrl(created.task_id, created.pass_key),
    outputName(item.file.name, target),
    "server"
  );
}

/**
 * 串行执行批量转换。返回最终结果列表（含全部终态项）。
 * 队列语义：429 配额不足 → 中断，剩余标 skipped；其他单项错误 → 标 error 继续。
 */
export async function runBatch(
  files: File[],
  target: string,
  events: BatchEvents
): Promise<BatchItem[]> {
  const items: BatchItem[] = files.map((file) => ({
    file,
    status: "pending",
    message: "等待转换",
  }));
  let quotaExhausted = false;

  for (let i = 0; i < items.length; i++) {
    if (quotaExhausted) {
      items[i] = { ...items[i], status: "skipped", message: "配额不足，未转换" };
      events.onUpdate([...items]);
      continue;
    }
    items[i] = { ...items[i], status: "converting", message: "转换中…" };
    events.onUpdate([...items]);
    try {
      const prev = items[i];
      items[i] = await convertOne(items[i], target);
      if (prev !== items[i] && items[i].path === "server") {
        events.onQuotaChange(); // 服务端转换已扣配额，刷新展示
      }
      if (items[i].path === "local") {
        events.onQuotaChange(); // 本地计次上报后刷新
      }
    } catch (err) {
      if (err instanceof ApiStatusError && err.status === 429) {
        quotaExhausted = true;
        items[i] = { ...items[i], status: "error", message: err.message };
      } else {
        items[i] = {
          ...items[i],
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
    events.onUpdate([...items]);
  }
  return items;
}

/** 收集成功项结果（打包下载输入）。 */
export function collectResults(items: BatchItem[]): BatchResult[] {
  return items
    .filter((it) => it.status === "done" && it.url && it.name)
    .map((it) => ({ name: it.name as string, url: it.url as string }));
}
