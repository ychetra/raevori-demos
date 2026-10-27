/** What clientIp returns with no proxy header (local runs, tests). Per-IP limits don't apply to it; production is always behind Cloudflare. */
export const UNKNOWN_IP = "unknown";

/** Cloudflare's visitor IP, else the first X-Forwarded-For hop, else "unknown". */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || UNKNOWN_IP;
}
