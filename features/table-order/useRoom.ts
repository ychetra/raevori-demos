"use client";

import { useEffect, useState } from "react";
import { roomExists } from "./api";
import type { Order, RoomEvent } from "./types";

export type RoomStatus = "connecting" | "live" | "closed";

/** Live orders for a room. Reconnects after drops (the server resends a full snapshot) and reports "closed" once the room is gone. */
export function useRoom(roomId: string | null): { orders: Order[]; status: RoomStatus } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<RoomStatus>("connecting");

  useEffect(() => {
    if (!roomId) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      es = new EventSource(`/api/rooms/${encodeURIComponent(roomId)}/events`);
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as RoomEvent | { type: "closed" };
        if (e.type === "snapshot") {
          setOrders(e.orders);
          setStatus("live");
        } else if (e.type === "order") {
          setOrders((prev) => {
            const i = prev.findIndex((o) => o.id === e.order.id);
            return i < 0 ? [...prev, e.order] : prev.map((o) => (o.id === e.order.id ? e.order : o));
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
        roomExists(roomId)
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
  }, [roomId]);

  return { orders, status };
}
