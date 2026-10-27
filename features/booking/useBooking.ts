"use client";

import { useEffect, useState } from "react";
import { bookingRoomExists } from "./api";
import type { Booking, BookingEvent } from "./types";

export type LiveStatus = "connecting" | "live" | "closed";

/**
 * Live bookings for a room, in creation order, including expired holds (filter them for display).
 * Reconnects after drops (the server resends a full snapshot) and reports "closed" once the room is gone.
 */
export function useBooking(roomId: string | null): { bookings: Booking[]; status: LiveStatus } {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    if (!roomId) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      es = new EventSource(`/api/bookings/${encodeURIComponent(roomId)}/events`);
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as BookingEvent | { type: "closed" };
        if (e.type === "snapshot") {
          setBookings(e.bookings);
          setStatus("live");
        } else if (e.type === "booking") {
          setBookings((prev) => {
            const i = prev.findIndex((b) => b.id === e.booking.id);
            return i < 0 ? [...prev, e.booking] : prev.map((b) => (b.id === e.booking.id ? e.booking : b));
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
        bookingRoomExists(roomId)
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

  return { bookings, status };
}
