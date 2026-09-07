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
    credentials: "include", // 登录用户需携带 Cookie 以命中更高配额档
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

// ===== 认证（切片 5a）：跨源 API，Cookie 需显式 credentials =====

export interface AuthUser {
  id: string;
  email: string;
}

export async function sendCode(email: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  await unwrap<{ sent: boolean }>(resp, (b) => b as Envelope<{ sent: boolean }>);
}

export async function verifyCode(email: string, code: string): Promise<AuthUser> {
  const resp = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, code }),
  });
  const data = await unwrap<{ user: AuthUser }>(resp, (b) => b as Envelope<{ user: AuthUser }>);
  return data.user;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const resp = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
  if (resp.status === 401) return null;
  const data = await unwrap<{ user: AuthUser }>(resp, (b) => b as Envelope<{ user: AuthUser }>);
  return data.user;
}

export async function logout(): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  await unwrap<{ logged_out: boolean }>(resp, (b) => b as Envelope<{ logged_out: boolean }>);
}

// ===== 配额（切片 5b）：预检摘要与本地计次 =====

export interface QuotaSummary {
  authenticated: boolean;
  used: { count: number; traffic_bytes: number };
  limit: { count: number; traffic_bytes: number; max_upload_bytes: number };
  reset_at: string;
}

export async function fetchQuotaSummary(): Promise<QuotaSummary> {
  const resp = await fetch(`${API_BASE}/api/quota/summary`, {
    credentials: "include",
  });
  return unwrap<QuotaSummary>(resp, (b) => b as Envelope<QuotaSummary>);
}

export async function reportLocalCount(): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/quota/local-count`, {
    method: "POST",
    credentials: "include",
  });
  await unwrap<{ counted: boolean }>(resp, (b) => b as Envelope<{ counted: boolean }>);
}

// ===== 压缩包（切片 8）：打包 / 解压，响应直接为附件流 =====

export async function packFiles(files: File[]): Promise<Blob> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const resp = await fetch(`${API_BASE}/api/archive/pack`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!resp.ok) {
    const body = (await resp.json()) as Envelope<null>;
    throw new Error(body.message || `HTTP ${resp.status}`);
  }
  return resp.blob();
}

export async function extractArchive(file: File): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${API_BASE}/api/archive/extract`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!resp.ok) {
    const body = (await resp.json()) as Envelope<null>;
    throw new Error(body.message || `HTTP ${resp.status}`);
  }
  return resp.blob();
}