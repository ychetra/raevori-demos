import type { MetadataRoute } from "next";

const BASE = "https://demo.raevori.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/table-order`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/shop-assistant`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/shop-pulse`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
