import { err, publicEvent, store } from "@/features/booking/server";
import type { BookingEvent } from "@/features/booking/types";

export const dynamic = "force-dynamic";

/** How often an open stream sweeps its room, so run-out holds clear from calendars within seconds. */
const HOLD_SWEEP_MS = 5_000;

/** Live booking updates as Server-Sent Events: a snapshot first, then each changed booking. */
export async function GET(req: Request, ctx: RouteContext<"/api/bookings/[id]/events">) {
  const { id } = await ctx.params;
  const room = store.get(id);
  if (!room) return err(404, "not_found");

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Every event goes through publicEvent, so no visitor's phone reaches the other link holders.
      const send = (e: BookingEvent | { type: "closed" }) => controller.enqueue(enc.encode(`data: ${JSON.stringify(publicEvent(e))}\n\n`));
      send({ type: "snapshot", bookings: room.bookings });
      const off = store.subscribe(id, send);
      // Reading the room expires its run-out holds (sent to every subscriber as `booking` events),
      // and notices when the room itself has expired.
      const sweep = setInterval(() => {
        if (store.get(id)) return;
        send({ type: "closed" });
        cleanup();
        controller.close();
      }, HOLD_SWEEP_MS);
      // Pings keep proxies from closing the stream.
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 20_000);
      cleanup = () => {
        clearInterval(sweep);
        clearInterval(ping);
        off();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
