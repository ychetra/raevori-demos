"use client";

import { useEffect, useState } from "react";
import { openLiveFeed } from "@/lib/live-feed";
import { DEFAULT_SETTINGS } from "./admin";
import { MENU } from "./menu";
import type { MenuItem, Order, RoomEvent, ShopSettings } from "./types";

export type RoomStatus = "connecting" | "live" | "closed";

/**
 * Live orders, menu and settings for a room. Until the first snapshot the menu and settings are the defaults.
 * Reconnects after drops (the server resends a full snapshot) and reports "closed" once the room is gone. Polls the snapshot if the stream is held back (see openLiveFeed).
 */
export function useRoom(roomId: string | null): { orders: Order[]; menu: MenuItem[]; settings: ShopSettings; status: RoomStatus } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>(MENU);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<RoomStatus>("connecting");

  useEffect(() => {
    if (!roomId) return;
    const url = `/api/rooms/${encodeURIComponent(roomId)}`;
    return openLiveFeed<RoomEvent>(
      `${url}/events`,
      url,
      (e) => {
        if (e.type === "snapshot") {
          setOrders(e.orders);
          setMenu(e.menu);
          setSettings(e.settings);
          setStatus("live");
        } else if (e.type === "order") {
          setOrders((prev) => {
            const i = prev.findIndex((o) => o.id === e.order.id);
            return i < 0 ? [...prev, e.order] : prev.map((o) => (o.id === e.order.id ? e.order : o));
          });
        } else if (e.type === "menu") {
          setMenu(e.menu);
        } else if (e.type === "settings") {
          setSettings(e.settings);
        } else if (e.type === "closed") {
          setStatus("closed");
        }
      },
      () => setStatus((s) => (s === "closed" ? s : "connecting")),
    );
  }, [roomId]);

  return { orders, menu, settings, status };
}
