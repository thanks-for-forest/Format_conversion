import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site";

// robots.txt：全站允许抓取，并指向 sitemap。

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
