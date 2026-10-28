import { randomBytes } from "node:crypto";
import { isSecure, readCookie, sign, verify } from "@/lib/signed-cookie";

const COOKIE = "ra_s";
const MAX_AGE = 24 * 60 * 60;

/** The visitor's chat session from the signed `ra_s` cookie; a missing or forged cookie starts a new session. */
export function getSession(req: Request): { id: string; setCookie?: string } {
  const id = verify(readCookie(req, COOKIE));
  if (id) return { id };
  const fresh = randomBytes(12).toString("base64url");
  return { id: fresh, setCookie: `${COOKIE}=${sign(fresh)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}` };
}
