import { isSecure, readCookie, sign, verify } from "@/lib/signed-cookie";

/** The owner's queue admin cookie. Its path is the queue's admin API, so each queue has its own and it is sent nowhere else. */
export const ADMIN_COOKIE = "rq_admin";
const MAX_AGE_S = 2 * 60 * 60;
const PURPOSE = "queue-admin";

/** Set-Cookie for a queue's admin, valid 2 hours: the signed value is `queue:expiry`, so it works for that queue only and stops at the expiry even if kept. */
export function adminCookie(req: Request, queueId: string, now = Date.now()): string {
  const value = sign(`${queueId}:${now + MAX_AGE_S * 1000}`, PURPOSE);
  return `${ADMIN_COOKIE}=${value}; Path=/api/queues/${queueId}/admin; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`;
}

/** Set-Cookie that removes the queue's admin cookie (logout). */
export function clearAdminCookie(req: Request, queueId: string): string {
  return `${ADMIN_COOKIE}=; Path=/api/queues/${queueId}/admin; Max-Age=0; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`;
}

/** True when the request carries an unexpired admin cookie signed for this queue. */
export function isAdmin(req: Request, queueId: string, now = Date.now()): boolean {
  const value = verify(readCookie(req, ADMIN_COOKIE), PURPOSE);
  if (!value) return false;
  const [queue, exp] = value.split(":");
  return queue === queueId && Number(exp) > now;
}
