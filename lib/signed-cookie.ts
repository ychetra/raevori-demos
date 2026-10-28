import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const g = globalThis as typeof globalThis & { __sessionSecret?: string };

// Without SESSION_SECRET (local dev) a per-process secret is used; signed cookies then end on restart.
function secret(): string {
  return process.env.SESSION_SECRET || (g.__sessionSecret ??= randomBytes(32).toString("hex"));
}

// `purpose` keeps signatures apart, so a cookie signed for one use never verifies for another. The empty purpose is the chat session's.
const mac = (value: string, purpose: string) => createHmac("sha256", secret()).update(purpose ? `${purpose}\n${value}` : value).digest("base64url");

/** `value.mac`. `value` must not contain a dot. */
export const sign = (value: string, purpose = "") => `${value}.${mac(value, purpose)}`;

/** The value of a `value.mac` string signed for `purpose`, or null when it is missing or forged. */
export function verify(signed: string | undefined, purpose = ""): string | null {
  const [value, got] = signed?.split(".") ?? [];
  if (!value || !got) return null;
  const want = Buffer.from(mac(value, purpose));
  const given = Buffer.from(got);
  return want.length === given.length && timingSafeEqual(want, given) ? value : null;
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("cookie")?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
}

/** True when the visitor reached us over HTTPS (directly or through the proxy), so cookies get `Secure`. */
export const isSecure = (req: Request) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
