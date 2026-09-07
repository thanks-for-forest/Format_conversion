import type { MetadataRoute } from "next";
import { COMBOS } from "./lib/formats";
import { SITE_URL } from "./lib/site";

// sitemap.xml：构建期静态生成，覆盖首页、登录页与全部 12 个 SEO 落地页。

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: "monthly", priority: 0.3 },
    ...COMBOS.map((c) => ({
      url: `${SITE_URL}/convert/${c.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
