import type { Text } from "@/lib/i18n";

export type ServiceId = "haircut" | "wash" | "colour" | "manicure" | "facial";
/** "bopha", "dara" and "srey-leak" by default; stylists the owner adds get server-made ids. */
export type StylistId = string;
export type BookingStatus = "held" | "booked" | "arrived" | "noshow" | "expired" | "cancelled";
/** What staff can set on a booked slot. */
export type VisitStatus = "arrived" | "noshow";
/** 0 Sunday ... 6 Saturday, Phnom Penh. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A service on the room's menu. `price` in dollars (50-cent steps); `minutes` is 30, 60, 90 or 120. Hidden services can't be booked. */
export type Service = { id: ServiceId; minutes: number; price: number; hidden?: boolean };
/** A stylist in roster order. `hours` are "HH:MM" on the hour or half hour; outside the salon's hours they are cut to them. */
export type Stylist = { id: StylistId; name: Text; daysOff: Weekday[]; hours: { start: string; end: string } };
/** `open`/`close` are "HH:MM" on the hour or half hour, Phnom Penh; `deposit` is $0-10 in 50-cent steps. */
export type SalonSettings = { name: string; open: string; close: string; deposit: number };
/** A room's own salon: what the owner can change in the admin. */
export type SalonConfig = { services: Service[]; stylists: Stylist[]; settings: SalonSettings };

/**
 * One booking. `start` and `end` are epoch ms; `end` is `start` plus the service's duration when it was held.
 * `price` and `deposit` are the dollars at hold time; later admin edits never change them.
 * `holdUntil` is set while the slot is held for payment (and kept after it is paid or expires).
 * `phone` is free text from the visitor, kept only in the room.
 * A cancelled booking has the owner's `cancelReason` and whether the deposit was `refund`ed (always false for an unpaid hold).
 * `movedAt` is when the owner last moved it.
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
  price: number;
  deposit: number;
  status: BookingStatus;
  holdUntil?: number;
  cancelReason?: string;
  refund?: boolean;
  movedAt?: number;
  at: Partial<Record<BookingStatus, number>>;
};

/** What a phone sends to hold a slot. "any" is resolved to the first free stylist in roster order. */
export type HoldInput = { service: ServiceId; stylist: StylistId | "any"; start: number; name: string; phone?: string };

/**
 * Every booking change (held, paid, expired, arrived, no-show, cancelled, moved) is a `booking` event carrying the whole booking.
 * Every admin config change is a `config` event carrying the whole config. The snapshot carries both.
 */
export type BookingEvent =
  | ({ type: "snapshot"; bookings: Booking[] } & SalonConfig)
  | { type: "booking"; booking: Booking }
  | ({ type: "config" } & SalonConfig);
/** `bookings` is in creation order (seeded first). `pin` is the owner's admin PIN and never leaves the server, except to the room's creator. */
export type BookingRoom = { id: string; bookings: Booking[]; touchedAt: number; pin: string } & SalonConfig;
