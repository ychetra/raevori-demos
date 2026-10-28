import { err, publicRoom, store } from "@/features/table-order/server";
import type { RoomEvent } from "@/features/table-order/types";

export const dynamic = "force-dynamic";

/** Live room updates as Server-Sent Events: a snapshot first (orders, menu, settings; never the PIN), then each changed order, menu or settings. */
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[id]/events">) {
  const { id } = await ctx.params;
  const room = store.get(id);
  if (!room) return err(404, "not_found");

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: RoomEvent | { type: "closed" }) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      send({ type: "snapshot", ...publicRoom(room) });
      const off = store.subscribe(id, send);
      // Pings keep proxies from closing the stream; they also notice when the room has expired.
      const ping = setInterval(() => {
        if (!store.get(id)) {
          send({ type: "closed" });
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(enc.encode(": ping\n\n"));
      }, 20_000);
      cleanup = () => {
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
