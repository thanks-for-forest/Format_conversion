// 本地 Markdown → HTML 引擎（切片 10a）：逐行解析 + 行内规则，纯浏览器端完成，文件不上传。
// 安全基线：先整体 HTML 转义再应用 Markdown 语法（生成的文件不含可执行脚本），
// 链接仅允许 http/https/协议相对/站内相对路径，javascript: 等危险 scheme 一律剔除。

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }
  // 无冒号的相对路径放行（含 ./ ../），其余（伪协议等）剔除
  return /^[^:]*$/.test(trimmed) ? trimmed : "";
}

// 输入已整体转义；顺序：行内代码 → 链接 → 加粗 → 斜体
function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
      const safe = safeUrl(url);
      return safe ? `<a href="${safe}">${label}</a>` : label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function markdownToHtml(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let inCode = false;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      closeList();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${line}\n`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        out.push(`<${want}>`);
        listType = want;
      }
      out.push(`<li>${renderInline((ul ?? ol)![1])}</li>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      closeList();
      out.push("<hr>");
      continue;
    }
    if (/^&gt;\s?/.test(line)) {
      // 整体转义后引用符呈 &gt;，需按转义形态识别
      closeList();
      out.push(
        `<blockquote><p>${renderInline(line.replace(/^&gt;\s?/, ""))}</p></blockquote>`
      );
      continue;
    }
    if (line.trim() === "") {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

export function wrapHtmlDocument(title: string, bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="zh">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    bodyHtml,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
