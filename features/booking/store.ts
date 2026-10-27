import { randomBytes } from "node:crypto";
import { DAY_MS, dayKey, HOUR_MS, startOfDay } from "@/features/shop-pulse/time";
import { freeStylist, isFree } from "./availability";
import { BOOKING_DAYS, CLOSE_HOUR, durationMs, HOLD_MS, OPEN_HOUR, SLOT_MS, STYLISTS } from "./salon";
import type { Booking, BookingEvent, BookingRoom, HoldInput, ServiceId, StylistId, VisitStatus } from "./types";

export type BookingErrorCode = "not_found" | "full" | "taken" | "expired" | "wrong_state" | "bad_name" | "bad_phone" | "bad_start";

export class BookingError extends Error {
  constructor(readonly code: BookingErrorCode) {
    super(code);
  }
}

export interface BookingStore {
  create(): BookingRoom;
  /** The room, with any run-out holds marked expired first (and sent to subscribers). */
  get(id: string): BookingRoom | undefined;
  /** Holds a slot for 5 minutes while the phone pays. Re-checks availability; throws `taken` when the slot is gone. */
  hold(id: string, input: HoldInput): Booking;
  /** Turns a live hold into a booking. Throws `expired` once the hold has run out; paying twice returns the booking. */
  pay(id: string, bookingId: string): Booking;
  /** Staff mark a booked slot arrived or no-show; anything but `booked` throws `wrong_state`. */
  setStatus(id: string, bookingId: string, status: VisitStatus): Booking;
  subscribe(id: string, fn: (e: BookingEvent) => void): () => void;
  /** Marks run-out holds expired (sending them) and drops rooms idle past the TTL. */
  sweep(): void;
}

export const MAX_NAME = 40;
export const MAX_PHONE = 20;

/** Made-up Khmer first names, in Latin script, for the seeded customers. */
const NAMES = ["Sophea", "Vanna", "Rachana", "Pisey", "Sokha", "Chantha", "Kanha", "Malis", "Nary", "Sreymom", "Vibol", "Ratha", "Sothea", "Phalla", "Kimly", "Leakena", "Chenda", "Davy", "Thida", "Panha", "Rithy", "Sreyneang"];

/** How often each service is picked when seeding: mostly haircuts, then washes and manicures. */
const SEED_SERVICES: [ServiceId, number][] = [["haircut", 30], ["wash", 20], ["colour", 15], ["manicure", 20], ["facial", 15]];

/** mulberry32: a tiny seeded PRNG, uniform in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

type Seed = Omit<Booking, "id" | "room">;

/**
 * Today's and tomorrow's bookings (Phnom Penh) for a new room, the same for every room created on the same day.
 * Each stylist alternates a booking with a gap about as long as it, so roughly half the day is booked.
 * Bookings that have ended by `now` arrived, except exactly one no-show; the rest are booked (deposit paid).
 */
export function seedBookings(now: number): Seed[] {
  const today = startOfDay(now);
  const rand = mulberry32(hash(`booking:${dayKey(now)}`));
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const weighted = (fits: (s: ServiceId) => boolean): ServiceId | null => {
    const options = SEED_SERVICES.filter(([s]) => fits(s));
    let r = rand() * options.reduce((n, [, w]) => n + w, 0);
    for (const [s, w] of options) if ((r -= w) < 0) return s;
    return options.at(-1)?.[0] ?? null;
  };

  const out: Seed[] = [];
  for (const day of [today, today + DAY_MS]) {
    const close = day + CLOSE_HOUR * HOUR_MS;
    for (const stylist of STYLISTS) {
      let t = day + OPEN_HOUR * HOUR_MS + pick([0, 1, 2]) * SLOT_MS;
      while (t < close) {
        const service = weighted((s) => t + durationMs(s) <= close);
        if (!service) break;
        const end = t + durationMs(service);
        out.push({ service, stylist, start: t, end, name: pick(NAMES), status: "booked", at: { booked: Math.min(now, t) - (1 + Math.floor(rand() * 47)) * HOUR_MS } });
        t = end + Math.max(0, durationMs(service) + pick([-1, 0, 1]) * SLOT_MS);
      }
    }
  }

  out.sort((a, b) => a.start - b.start || STYLISTS.indexOf(a.stylist) - STYLISTS.indexOf(b.stylist));
  const ended = out.filter((b) => b.end <= now);
  const noshow = ended.length ? ended[Math.floor(rand() * ended.length)] : null;
  for (const b of ended) {
    if (b === noshow) Object.assign(b, { status: "noshow", at: { ...b.at, noshow: b.start + 15 * 60_000 } });
    else Object.assign(b, { status: "arrived", at: { ...b.at, arrived: b.start } });
  }
  return out;
}

type Entry = BookingRoom & { listeners: Set<(e: BookingEvent) => void> };

/** Rooms live in memory: one per visitor session, private, dropped after `ttlMs` without activity. */
// `now` reads Date.now on each call (not a captured reference), so tests with a fake clock can expire the shared store.
export function createMemoryStore({ maxRooms = 500, maxBookings = 200, ttlMs = 2 * 60 * 60 * 1000, now = () => Date.now() } = {}): BookingStore {
  const rooms = new Map<string, Entry>();

  const touch = (r: Entry) => {
    r.touchedAt = now();
    // Map keeps insertion order; re-inserting puts the most recently touched room last.
    rooms.delete(r.id);
    rooms.set(r.id, r);
  };
  const must = (id: string) => {
    const r = rooms.get(id);
    if (!r) throw new BookingError("not_found");
    return r;
  };
  const find = (r: Entry, bookingId: string) => {
    const b = r.bookings.find((x) => x.id === bookingId);
    if (!b) throw new BookingError("not_found");
    return b;
  };
  // Each listener is isolated: one that throws (e.g. a dead live stream) is dropped, and the others
  // still get the event, so a booking that was stored is never reported as failed.
  const emit = (r: Entry, e: BookingEvent) => {
    for (const fn of [...r.listeners]) {
      try {
        fn(e);
      } catch {
        r.listeners.delete(fn);
      }
    }
  };
  /** Replaces the stored booking and tells subscribers. */
  const put = (r: Entry, booking: Booking) => {
    r.bookings[r.bookings.findIndex((b) => b.id === booking.id)] = booking;
    emit(r, { type: "booking", booking });
    return booking;
  };
  const runOut = (b: Booking) => b.status === "held" && b.holdUntil !== undefined && now() >= b.holdUntil;
  const expire = (r: Entry, b: Booking) => put(r, { ...b, status: "expired", at: { ...b.at, expired: now() } });
  /** Lazy hold expiry: marks this room's run-out holds expired and sends them. */
  const expireHolds = (r: Entry) => {
    for (const b of r.bookings) if (runOut(b)) expire(r, b);
  };

  /** A start the phone could have been offered: whole ms, on the grid, inside opening hours, today to day 7. */
  const validStart = (start: number) => {
    if (!Number.isInteger(start)) return false;
    const day = startOfDay(start);
    const open = day + OPEN_HOUR * HOUR_MS;
    const first = startOfDay(now());
    return start >= open && start < day + CLOSE_HOUR * HOUR_MS && (start - open) % SLOT_MS === 0 && day >= first && day < first + BOOKING_DAYS * DAY_MS;
  };

  return {
    create() {
      while (rooms.size >= maxRooms) rooms.delete(rooms.keys().next().value!);
      const id = randomBytes(12).toString("base64url");
      const r: Entry = { id, bookings: [], touchedAt: now(), listeners: new Set() };
      r.bookings = seedBookings(now()).map((s) => ({ id: randomBytes(9).toString("base64url"), room: id, ...s }));
      rooms.set(id, r);
      return r;
    },
    get(id) {
      const r = rooms.get(id);
      if (r) expireHolds(r);
      return r;
    },
    hold(id, input) {
      const r = must(id);
      const name = input.name.trim();
      if (!name || [...name].length > MAX_NAME) throw new BookingError("bad_name");
      const phone = input.phone?.trim() || undefined;
      if (phone && [...phone].length > MAX_PHONE) throw new BookingError("bad_phone");
      if (!validStart(input.start)) throw new BookingError("bad_start");
      if (r.bookings.length >= maxBookings) throw new BookingError("full");
      expireHolds(r);
      const t = now();
      const stylist: StylistId | null =
        input.stylist === "any" ? freeStylist(r.bookings, input.service, input.start, t) : isFree(r.bookings, input.service, input.stylist, input.start, t) ? input.stylist : null;
      if (!stylist) throw new BookingError("taken");
      const b: Booking = {
        id: randomBytes(9).toString("base64url"),
        room: id,
        service: input.service,
        stylist,
        start: input.start,
        end: input.start + durationMs(input.service),
        name,
        ...(phone && { phone }),
        status: "held",
        holdUntil: t + HOLD_MS,
        at: { held: t },
      };
      r.bookings.push(b);
      touch(r);
      emit(r, { type: "booking", booking: b });
      return b;
    },
    pay(id, bookingId) {
      const r = must(id);
      const b = find(r, bookingId);
      touch(r);
      if (runOut(b)) {
        expire(r, b);
        throw new BookingError("expired");
      }
      if (b.status === "expired") throw new BookingError("expired");
      if (b.status !== "held") return b;
      return put(r, { ...b, status: "booked", at: { ...b.at, booked: now() } });
    },
    setStatus(id, bookingId, status) {
      const r = must(id);
      const b = find(r, bookingId);
      touch(r);
      if (b.status !== "booked") throw new BookingError("wrong_state");
      return put(r, { ...b, status, at: { ...b.at, [status]: now() } });
    },
    subscribe(id, fn) {
      const r = must(id);
      r.listeners.add(fn);
      touch(r);
      return () => r.listeners.delete(fn);
    },
    sweep() {
      const cutoff = now() - ttlMs;
      for (const r of rooms.values()) {
        if (r.touchedAt < cutoff) rooms.delete(r.id);
        else expireHolds(r);
      }
    },
  };
}
