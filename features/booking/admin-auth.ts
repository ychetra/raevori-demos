import { isSecure, readCookie, sign, verify } from "@/lib/signed-cookie";

/** The salon owner's admin cookie. Its path is the room's admin API, so each room has its own and it is sent nowhere else. */
export const ADMIN_COOKIE = "ra_salon_admin";
const MAX_AGE_S = 2 * 60 * 60;
// Its own purpose, so a café admin cookie never verifies here even for the same id string.
const PURPOSE = "booking-admin";

/** Set-Cookie for a room's admin, valid 2 hours: the signed value is `room:expiry`, so it works for that room only and stops at the expiry even if kept. */
export function adminCookie(req: Request, roomId: string, now = Date.now()): string {
  const value = sign(`${roomId}:${now + MAX_AGE_S * 1000}`, PURPOSE);
  return `${ADMIN_COOKIE}=${value}; Path=/api/bookings/${roomId}/admin; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`;
}

/** Set-Cookie that removes the room's admin cookie (logout). */
export function clearAdminCookie(req: Request, roomId: string): string {
  return `${ADMIN_COOKIE}=; Path=/api/bookings/${roomId}/admin; Max-Age=0; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`;
}

/** True when the request carries an unexpired admin cookie signed for this room. */
export function isAdmin(req: Request, roomId: string, now = Date.now()): boolean {
  const value = verify(readCookie(req, ADMIN_COOKIE), PURPOSE);
  if (!value) return false;
  const [room, exp] = value.split(":");
  return room === roomId && Number(exp) > now;
}
