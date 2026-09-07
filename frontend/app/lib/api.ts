// API 客户端：与后端统一信封 { code, data, message } 对齐。

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export interface CreateResult {
  task_id: string;
  pass_key: string;
  status: string;
  in_size: number;
}

export interface TaskInfo {
  task_id: string;
  status: string;
  message: string;
  source_name: string;
  target_ext: string;
  in_size: number;
  out_size: number | null;
  files_removed: boolean;
}

interface Envelope<T> {
  code: number;
  data: T | null;
  message: string;
}

async function unwrap<T>(resp: Response, parse: (body: unknown) => Envelope<T>): Promise<T> {
  const body = parse(await resp.json());
  if (body.code !== 0 || !body.data) {
    throw new Error(body.message || `HTTP ${resp.status}`);
  }
  return body.data;
}

export async function createConversion(file: File, target: string): Promise<CreateResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("target", target);
  const resp = await fetch(`${API_BASE}/api/convert`, {
    method: "POST",
    body: form,
  });
  return unwrap<CreateResult>(resp, (b) => b as Envelope<CreateResult>);
}

export async function pollUntilDone(taskId: string, passKey: string): Promise<TaskInfo> {
  for (;;) {
    const resp = await fetch(`${API_BASE}/api/tasks/${taskId}?pass_key=${passKey}`);
    const data = await unwrap<TaskInfo>(resp, (b) => b as Envelope<TaskInfo>);
    if (data.status === "succeeded" || data.status === "failed") {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

export function buildDownloadUrl(taskId: string, passKey: string): string {
  return `${API_BASE}/api/tasks/${taskId}/download?pass_key=${passKey}`;
}