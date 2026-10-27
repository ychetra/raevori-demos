import { bookingLimiter, err, store } from "@/features/booking/server";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!bookingLimiter.allow(clientIp(req))) return err(429, "too_many_rooms");
  const { id } = store.create();
  return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
