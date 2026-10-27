"use client";

import { useEffect, useState } from "react";
import { queueExists } from "./api";
import type { QueueEvent, Ticket } from "./types";

export type QueueStatus = "connecting" | "live" | "closed";

/**
 * Live tickets for a queue, in take order. Reconnects after drops (the server resends a full snapshot, so a phone
 * that was offline catches up on calls it missed) and reports "closed" once the queue is gone.
 */
export function useQueue(queueId: string | null): { tickets: Ticket[]; status: QueueStatus } {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<QueueStatus>("connecting");

  useEffect(() => {
    if (!queueId) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      es = new EventSource(`/api/queues/${encodeURIComponent(queueId)}/events`);
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as QueueEvent | { type: "closed" };
        if (e.type === "snapshot") {
          setTickets(e.tickets);
          setStatus("live");
        } else if (e.type === "ticket") {
          setTickets((prev) => {
            const i = prev.findIndex((t) => t.id === e.ticket.id);
            return i < 0 ? [...prev, e.ticket] : prev.map((t) => (t.id === e.ticket.id ? e.ticket : t));
          });
        } else {
          setStatus("closed");
          es?.close();
          stopped = true;
        }
      };
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        setStatus((s) => (s === "closed" ? s : "connecting"));
        queueExists(queueId)
          .then((exists) => {
            if (stopped) return;
            if (!exists) return setStatus("closed");
            retry = setTimeout(connect, 1500);
          })
          .catch(() => {
            if (!stopped) retry = setTimeout(connect, 3000);
          });
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [queueId]);

  return { tickets, status };
}
