// 前端格式单一来源：与后端 core/formats.py（图片）、core/doc_formats.py（文档）、
// core/audio_formats.py（音频）口径一致。

export type Category = "image" | "doc" | "audio";

export interface Combo {
  slug: string; // 如 png-to-jpg（路由参数）
  from: string; // 源扩展名（规范名，不含 jpeg）
  to: string; // 目标扩展名
  category: Category; // 决定本地/服务端路由与落地页文案
}

export const SOURCE_EXTS = ["png", "jpg", "webp", "bmp", "gif"];
export const TARGET_EXTS = ["png", "jpg", "webp"];

// 文档类别：X → PDF 走服务端 LibreOffice；md → html 浏览器本地渲染
export const DOC_SOURCE_EXTS = [
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "html",
  "csv",
  "txt",
];
export const DOC_TARGET_EXTS = ["pdf"];

// 音频类别（切片 10b）：6 格式互转，全部走服务端 ffmpeg（本地 wasm 留后续切片）
export const AUDIO_SOURCE_EXTS = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];

// 文件选择框 accept 属性的别名映射（jpeg 与 jpg 同义）
export const ACCEPT_ALIAS: Record<string, string> = { jpg: ".jpg,.jpeg" };

const IMAGE_COMBOS: Combo[] = SOURCE_EXTS.flatMap((from) =>
  TARGET_EXTS.filter((to) => to !== from).map((to) => ({
    slug: `${from}-to-${to}`,
    from,
    to,
    category: "image" as const,
  }))
);

const DOC_COMBOS: Combo[] = DOC_SOURCE_EXTS.map((from) => ({
  slug: `${from}-to-pdf`,
  from,
  to: "pdf",
  category: "doc" as const,
}));

// 音频互转：6 × 5（排除同格式），全部服务端 ffmpeg
const AUDIO_COMBOS: Combo[] = AUDIO_SOURCE_EXTS.flatMap((from) =>
  AUDIO_SOURCE_EXTS.filter((to) => to !== from).map((to) => ({
    slug: `${from}-to-${to}`,
    from,
    to,
    category: "audio" as const,
  }))
);

// Markdown 本地渲染为 HTML（浏览器端，不上传；服务端不支持 md 源）
export const MD_TO_HTML: Combo = {
  slug: "md-to-html",
  from: "md",
  to: "html",
  category: "doc",
};

// 全部合法组合：图片互转 + 文档转 PDF + 音频互转 + MD 转 HTML
export const COMBOS: Combo[] = [
  ...IMAGE_COMBOS,
  ...DOC_COMBOS,
  ...AUDIO_COMBOS,
  MD_TO_HTML,
];

// 首页文件选择框可选源（含 md）
export const ALL_SOURCE_EXTS = [
  ...SOURCE_EXTS,
  ...DOC_SOURCE_EXTS,
  ...AUDIO_SOURCE_EXTS,
  "md",
];

export function parseCombo(slug: string): Combo | null {
  return COMBOS.find((c) => c.slug === slug) ?? null;
}

export function sourceExtOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  return ext === "jpeg" ? "jpg" : ext;
}

// 按源扩展名判定类别（md 视作文档类别）
export function categoryOf(ext: string): Category {
  if (ext === "md" || DOC_SOURCE_EXTS.includes(ext)) return "doc";
  if (AUDIO_SOURCE_EXTS.includes(ext)) return "audio";
  return "image";
}

// 首页目标格式下拉：图片互转排除同格式；文档源 → pdf；md 仅本地 html；音频互转排除同格式
export function targetOptionsFor(sourceExt: string): string[] {
  if (sourceExt === "md") return ["html"];
  if (AUDIO_SOURCE_EXTS.includes(sourceExt)) {
    return AUDIO_SOURCE_EXTS.filter((t) => t !== sourceExt);
  }
  if (DOC_SOURCE_EXTS.includes(sourceExt)) return DOC_TARGET_EXTS;
  return TARGET_EXTS.filter((t) => t !== sourceExt);
}

export function outputName(name: string, target: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${target}`;
}
