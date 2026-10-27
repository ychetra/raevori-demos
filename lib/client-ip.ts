/** Cloudflare's visitor IP, else the first X-Forwarded-For hop, else "unknown". */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
