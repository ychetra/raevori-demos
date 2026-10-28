"use client";

import { useEffect, useState } from "react";
import { openLiveFeed } from "@/lib/live-feed";
import { defaultConfig } from "./admin";
import type { QueueConfig, QueueEvent, Ticket } from "./types";

export type QueueStatus = "connecting" | "live" | "closed";

/**
 * Live tickets for a queue, in take order, and its config (services, counters, settings; the defaults until the first snapshot).
 * Reconnects after drops (the server resends a full snapshot, so a phone that was offline catches up on calls it missed)
 * and reports "closed" once the queue is gone. Polls the snapshot if the stream is held back (see openLiveFeed).
 */
export function useQueue(queueId: string | null): { tickets: Ticket[]; config: QueueConfig; status: QueueStatus } {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [config, setConfig] = useState<QueueConfig>(defaultConfig);
  const [status, setStatus] = useState<QueueStatus>("connecting");

  useEffect(() => {
    if (!queueId) return;
    const url = `/api/queues/${encodeURIComponent(queueId)}`;
    return openLiveFeed<QueueEvent>(
      `${url}/events`,
      url,
      (e) => {
        if (e.type === "snapshot") {
          setTickets(e.tickets);
          setConfig({ services: e.services, counters: e.counters, settings: e.settings });
          setStatus("live");
        } else if (e.type === "ticket") {
          setTickets((prev) => {
            const i = prev.findIndex((t) => t.id === e.ticket.id);
            return i < 0 ? [...prev, e.ticket] : prev.map((t) => (t.id === e.ticket.id ? e.ticket : t));
          });
        } else if (e.type === "config") {
          setConfig({ services: e.services, counters: e.counters, settings: e.settings });
        } else if (e.type === "closed") {
          setStatus("closed");
        }
      },
      () => setStatus((s) => (s === "closed" ? s : "connecting")),
    );
  }, [queueId]);

  return { tickets, config, status };
}
