import { err, queueLimiter, store } from "@/features/queue/server";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

/** Creates a queue. Only its creator (the laptop board) is told the owner's admin PIN. */
export async function POST(req: Request) {
  if (!queueLimiter.allow(clientIp(req))) return err(429, "too_many_rooms");
  const { id, pin } = store.create();
  return Response.json({ id, pin }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
