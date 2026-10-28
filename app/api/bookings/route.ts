import { bookingLimiter, err, store } from "@/features/booking/server";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

/** Creates a room. Only its creator (the laptop page) is told the owner's admin PIN. */
export async function POST(req: Request) {
  if (!bookingLimiter.allow(clientIp(req))) return err(429, "too_many_rooms");
  const { id, pin } = store.create();
  return Response.json({ id, pin }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
