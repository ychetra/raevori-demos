import { err, store } from "@/features/queue/server";
import type { QueueEvent } from "@/features/queue/types";

export const dynamic = "force-dynamic";

/** Live queue updates as Server-Sent Events: a snapshot first, then each changed ticket. */
export async function GET(req: Request, ctx: RouteContext<"/api/queues/[id]/events">) {
  const { id } = await ctx.params;
  const queue = store.get(id);
  if (!queue) return err(404, "not_found");

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: QueueEvent | { type: "closed" }) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      send({ type: "snapshot", tickets: queue.tickets });
      const off = store.subscribe(id, send);
      // Pings keep proxies from closing the stream; they also notice when the queue has expired.
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
