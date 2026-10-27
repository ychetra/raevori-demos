import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "ra_s";
const MAX_AGE = 24 * 60 * 60;

const g = globalThis as typeof globalThis & { __sessionSecret?: string };

// Without SESSION_SECRET (local dev) a per-process secret is used; sessions then end on restart.
function secret(): string {
  return process.env.SESSION_SECRET || (g.__sessionSecret ??= randomBytes(32).toString("hex"));
}

const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url");

function verify(value: string | undefined): string | null {
  const [id, mac] = value?.split(".") ?? [];
  if (!id || !mac) return null;
  const want = Buffer.from(sign(id));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("cookie")?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
}

/** The visitor's chat session from the signed `ra_s` cookie; a missing or forged cookie starts a new session. */
export function getSession(req: Request): { id: string; setCookie?: string } {
  const id = verify(readCookie(req, COOKIE));
  if (id) return { id };
  const fresh = randomBytes(12).toString("base64url");
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return { id: fresh, setCookie: `${COOKIE}=${fresh}.${sign(fresh)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}
