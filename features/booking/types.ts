export type ServiceId = "haircut" | "wash" | "colour" | "manicure" | "facial";
export type StylistId = "bopha" | "dara" | "srey-leak";
export type BookingStatus = "held" | "booked" | "arrived" | "noshow" | "expired";
/** What staff can set on a booked slot. */
export type VisitStatus = "arrived" | "noshow";

/**
 * One booking. `start` and `end` are epoch ms; `end` is `start` plus the service's duration.
 * `holdUntil` is set while the slot is held for payment (and kept after it is paid or expires).
 * `phone` is free text from the visitor, kept only in the room.
 */
export type Booking = {
  id: string;
  room: string;
  service: ServiceId;
  stylist: StylistId;
  start: number;
  end: number;
  name: string;
  phone?: string;
  status: BookingStatus;
  holdUntil?: number;
  at: Partial<Record<BookingStatus, number>>;
};

/** What a phone sends to hold a slot. "any" is resolved to the first free stylist in roster order. */
export type HoldInput = { service: ServiceId; stylist: StylistId | "any"; start: number; name: string; phone?: string };

/** Every change (held, paid, expired, arrived, no-show) is a `booking` event carrying the whole booking. */
export type BookingEvent = { type: "snapshot"; bookings: Booking[] } | { type: "booking"; booking: Booking };
/** `bookings` is in creation order (seeded first). */
export type BookingRoom = { id: string; bookings: Booking[]; touchedAt: number };
