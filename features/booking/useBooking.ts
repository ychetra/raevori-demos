"use client";

import { useEffect, useState } from "react";
import { openLiveFeed } from "@/lib/live-feed";
import { DEFAULT_SALON } from "./salon";
import type { Booking, BookingEvent, SalonConfig } from "./types";

export type LiveStatus = "connecting" | "live" | "closed";

/**
 * Live bookings for a room, in creation order, including expired holds and cancelled bookings (filter them for display),
 * and the room's salon config (services, stylists, settings), which is the default salon until the first snapshot.
 * Reconnects after drops (the server resends a full snapshot) and reports "closed" once the room is gone. Polls the snapshot if the stream is held back (see openLiveFeed).
 */
export function useBooking(roomId: string | null): { bookings: Booking[]; config: SalonConfig; status: LiveStatus } {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [config, setConfig] = useState<SalonConfig>(DEFAULT_SALON);
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    if (!roomId) return;
    const url = `/api/bookings/${encodeURIComponent(roomId)}`;
    return openLiveFeed<BookingEvent>(
      `${url}/events`,
      url,
      (e) => {
        if (e.type === "snapshot") {
          setBookings(e.bookings);
          setConfig({ services: e.services, stylists: e.stylists, settings: e.settings });
          setStatus("live");
        } else if (e.type === "booking") {
          setBookings((prev) => {
            const i = prev.findIndex((b) => b.id === e.booking.id);
            return i < 0 ? [...prev, e.booking] : prev.map((b) => (b.id === e.booking.id ? e.booking : b));
          });
        } else if (e.type === "config") {
          setConfig({ services: e.services, stylists: e.stylists, settings: e.settings });
        } else if (e.type === "closed") {
          setStatus("closed");
        }
      },
      () => setStatus((s) => (s === "closed" ? s : "connecting")),
    );
  }, [roomId]);

  return { bookings, config, status };
}
