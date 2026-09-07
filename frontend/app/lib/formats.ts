// 前端格式单一来源：与后端 core/formats.py 口径一致（五进三出，jpeg 是 jpg 别名）。

export const SOURCE_EXTS = ["png", "jpg", "webp", "bmp", "gif"];
export const TARGET_EXTS = ["png", "jpg", "webp"];

// 文件选择框 accept 属性的别名映射（jpeg 与 jpg 同义）
export const ACCEPT_ALIAS: Record<string, string> = { jpg: ".jpg,.jpeg" };

export interface Combo {
  slug: string; // 如 png-to-jpg（路由参数）
  from: string; // 源扩展名（规范名，不含 jpeg）
  to: string; // 目标扩展名
}

// 全部合法组合：五进 × 三出，去掉同格式互转（jpeg 归一为 jpg）
export const COMBOS: Combo[] = SOURCE_EXTS.flatMap((from) =>
  TARGET_EXTS.filter((to) => to !== from).map((to) => ({
    slug: `${from}-to-${to}`,
    from,
    to,
  }))
);

export function parseCombo(slug: string): Combo | null {
  return COMBOS.find((c) => c.slug === slug) ?? null;
}

export function sourceExtOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  return ext === "jpeg" ? "jpg" : ext;
}

export function outputName(name: string, target: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${target}`;
}
