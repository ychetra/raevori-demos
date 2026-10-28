/** How long a fresh stream may stay silent before we assume something in between buffers it (the server sends its snapshot at once). */
export const STALL_MS = 4000;
/** How often the polling fallback fetches the snapshot. */
export const POLL_MS = 1000;

/**
 * Live events for a room: Server-Sent Events from `eventsUrl`, with `snapshotUrl` (the room's JSON snapshot, 404 once it's gone) as a fallback.
 * Reconnects after a drop while the room exists. If the stream opens but sends nothing within STALL_MS (some proxies and tunnels
 * hold event streams back), it switches to fetching the snapshot every POLL_MS, delivered as `{ type: "snapshot", ... }`.
 * `onEvent` gets `{ type: "closed" }` when the room is gone; `onDown` is called whenever the connection drops. Returns stop.
 */
export function openLiveFeed<E extends { type: string }>(
  eventsUrl: string,
  snapshotUrl: string,
  onEvent: (e: E | { type: "closed" }) => void,
  onDown: () => void,
): () => void {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const closed = () => {
    stopped = true;
    es?.close();
    onEvent({ type: "closed" });
  };

  const poll = () => {
    fetch(snapshotUrl, { cache: "no-store" })
      .then(async (res) => {
        if (stopped) return;
        if (res.status === 404) return closed();
        if (!res.ok) throw new Error(String(res.status));
        onEvent({ type: "snapshot", ...(await res.json()) } as E);
      })
      .catch(() => {
        if (!stopped) onDown();
      })
      .finally(() => {
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      });
  };

  const connect = () => {
    let heard = false;
    es = new EventSource(eventsUrl);
    timer = setTimeout(() => {
      es?.close();
      poll();
    }, STALL_MS);
    es.onmessage = (m) => {
      if (!heard) clearTimeout(timer);
      heard = true;
      const e = JSON.parse(m.data) as E | { type: "closed" };
      if (e.type === "closed") return closed();
      onEvent(e);
    };
    es.onerror = () => {
      clearTimeout(timer);
      es?.close();
      if (stopped) return;
      onDown();
      fetch(snapshotUrl, { cache: "no-store" })
        .then((res) => {
          if (stopped) return;
          if (res.status === 404) return closed();
          timer = setTimeout(connect, 1500);
        })
        .catch(() => {
          if (!stopped) timer = setTimeout(connect, 3000);
        });
    };
  };

  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    es?.close();
  };
}
