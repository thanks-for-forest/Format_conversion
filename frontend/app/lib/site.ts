// 站点对外地址（构建期读取）：sitemap / robots 生成用。
// 生产部署时设 SITE_URL 为正式域名（如 https://example.com）。

export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3100").replace(
  /\/$/,
  ""
);
