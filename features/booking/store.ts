import { randomBytes, randomInt } from "node:crypto";
import { DAY_MS, dayKey, HOUR_MS, startOfDay } from "@/features/shop-pulse/time";
import { editService, editStylist, MAX_STYLISTS, newStylist, parseReason, parseRefund, parseSettings } from "./admin";
import { fits, freeStylist, isFree, workingHours } from "./availability";
import { BOOKING_DAYS, DEFAULT_SALON, defaultSalon, HOLD_MS, SLOT_MS, toMinutes } from "./salon";
import type { Booking, BookingEvent, BookingRoom, HoldInput, SalonConfig, SalonSettings, Service, ServiceId, Stylist, StylistId, VisitStatus } from "./types";

export type BookingErrorCode =
  | "not_found"
  | "full"
  | "taken"
  | "expired"
  | "wrong_state"
  | "bad_name"
  | "bad_phone"
  | "bad_start"
  | "bad_service"
  | "bad_stylist"
  | "too_many_stylists";

export class BookingError extends Error {
  constructor(readonly code: BookingErrorCode) {
    super(code);
  }
}

export type LoginResult = "ok" | "wrong" | "locked";

export interface BookingStore {
  create(): BookingRoom;
  /** The room, with any run-out holds marked expired first (and sent to subscribers). */
  get(id: string): BookingRoom | undefined;
  /**
   * Holds a slot for 5 minutes while the phone pays, at the room's current price and deposit. Re-checks availability
   * with the room's services, stylists and hours; throws `taken` when the slot is gone, `bad_service` for a hidden service.
   */
  hold(id: string, input: HoldInput): Booking;
  /** Turns a live hold into a booking. Throws `expired` once the hold has run out; paying twice returns the booking. */
  pay(id: string, bookingId: string): Booking;
  /** Staff mark a booked slot arrived or no-show; anything but `booked` throws `wrong_state`. */
  setStatus(id: string, bookingId: string, status: VisitStatus): Booking;
  /** Owner: edits a service (`{ id, price?, minutes?, hidden? }`). New holds use it; existing bookings keep their own. */
  updateService(id: string, patch: unknown): Service;
  /** Owner: edits a stylist (`{ id, name?, daysOff?, hours? }`). Existing bookings stay where they are. */
  updateStylist(id: string, patch: unknown): Stylist;
  /** Owner: adds a stylist at the end of the roster (`{ name, daysOff?, hours? }`); throws `too_many_stylists` past 5. */
  addStylist(id: string, input: unknown): Stylist;
  setSettings(id: string, input: unknown): SalonSettings;
  /** Owner: cancels a held or booked slot with a reason, refunding the deposit or keeping it (an unpaid hold has nothing to refund). */
  cancel(id: string, bookingId: string, reason: unknown, refund: unknown): Booking;
  /** Owner: moves a held or booked slot to another free start (and optionally stylist), keeping its id, service, length and price. */
  move(id: string, bookingId: string, start: unknown, stylist?: unknown): Booking;
  /** Restores the default services, stylists and settings; bookings and the PIN stay. */
  reset(id: string): BookingRoom;
  login(id: string, pin: unknown): LoginResult;
  subscribe(id: string, fn: (e: BookingEvent) => void): () => void;
  /** Marks run-out holds expired (sending them) and drops rooms idle past the TTL. */
  sweep(): void;
}

export const MAX_NAME = 40;
export const MAX_PHONE = 20;

const PIN_TRIES = 5;
const PIN_WINDOW_MS = 10 * 60 * 1000;

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
 * Follows `salon` (the default salon unless given): its visible services, prices and deposit, and each stylist's days off and hours.
 */
export function seedBookings(now: number, salon: SalonConfig = DEFAULT_SALON): Seed[] {
  const today = startOfDay(now);
  const rand = mulberry32(hash(`booking:${dayKey(now)}`));
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const menu = new Map(salon.services.filter((s) => !s.hidden).map((s) => [s.id, s]));
  const ms = (s: ServiceId) => menu.get(s)!.minutes * 60_000;
  const weighted = (fitsBy: (s: ServiceId) => boolean): ServiceId | null => {
    const options = SEED_SERVICES.filter(([s]) => menu.has(s) && fitsBy(s));
    let r = rand() * options.reduce((n, [, w]) => n + w, 0);
    for (const [s, w] of options) if ((r -= w) < 0) return s;
    return options.at(-1)?.[0] ?? null;
  };

  const out: Seed[] = [];
  for (const day of [today, today + DAY_MS]) {
    for (const stylist of salon.stylists) {
      const hours = workingHours(stylist, day, salon.settings);
      if (!hours) continue;
      let t = hours.from + pick([0, 1, 2]) * SLOT_MS;
      while (t < hours.to) {
        const service = weighted((s) => t + ms(s) <= hours.to);
        if (!service) break;
        const end = t + ms(service);
        out.push({
          service,
          stylist: stylist.id,
          start: t,
          end,
          name: pick(NAMES),
          price: menu.get(service)!.price,
          deposit: salon.settings.deposit,
          status: "booked",
          at: { booked: Math.min(now, t) - (1 + Math.floor(rand() * 47)) * HOUR_MS },
        });
        t = end + Math.max(0, ms(service) + pick([-1, 0, 1]) * SLOT_MS);
      }
    }
  }

  const order = salon.stylists.map((s) => s.id);
  out.sort((a, b) => a.start - b.start || order.indexOf(a.stylist) - order.indexOf(b.stylist));
  const ended = out.filter((b) => b.end <= now);
  const noshow = ended.length ? ended[Math.floor(rand() * ended.length)] : null;
  for (const b of ended) {
    if (b === noshow) Object.assign(b, { status: "noshow", at: { ...b.at, noshow: b.start + 15 * 60_000 } });
    else Object.assign(b, { status: "arrived", at: { ...b.at, arrived: b.start } });
  }
  return out;
}

type Entry = BookingRoom & { stylistSeq: number; pinFails: number[]; listeners: Set<(e: BookingEvent) => void> };

/** The room's config as it goes out in events and snapshots: only these three fields, so the PIN never rides along. */
export const salonOf = (r: SalonConfig): SalonConfig => ({ services: r.services, stylists: r.stylists, settings: r.settings });

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
  // Config arrays and objects are replaced, never changed in place, so a config already sent in an event stays as it was.
  const setConfig = (r: Entry, change: Partial<SalonConfig>) => {
    Object.assign(r, change);
    touch(r);
    emit(r, { type: "config", ...salonOf(r) });
  };
  const runOut = (b: Booking) => b.status === "held" && b.holdUntil !== undefined && now() >= b.holdUntil;
  const expire = (r: Entry, b: Booking) => put(r, { ...b, status: "expired", at: { ...b.at, expired: now() } });
  /** Lazy hold expiry: marks this room's run-out holds expired and sends them. */
  const expireHolds = (r: Entry) => {
    for (const b of r.bookings) if (runOut(b)) expire(r, b);
  };

  /** A start the phone could have been offered: whole ms, on the half-hour grid, inside the salon's hours, today to day 7. */
  const validStart = (start: unknown, settings: SalonSettings): start is number => {
    if (typeof start !== "number" || !Number.isInteger(start)) return false;
    const day = startOfDay(start);
    const first = startOfDay(now());
    const minute = (start - day) / 60_000;
    return (start - day) % SLOT_MS === 0 && minute >= toMinutes(settings.open) && minute < toMinutes(settings.close) && day >= first && day < first + BOOKING_DAYS * DAY_MS;
  };
  const stylistOf = (r: Entry, stylist: unknown) => {
    const st = r.stylists.find((s) => s.id === stylist);
    if (!st) throw new BookingError("bad_stylist");
    return st;
  };
  /** The owner may change a booking only while it is held (and not run out) or booked. */
  const changeable = (r: Entry, bookingId: string) => {
    expireHolds(r);
    const b = find(r, bookingId);
    touch(r);
    if (b.status !== "held" && b.status !== "booked") throw new BookingError("wrong_state");
    return b;
  };

  return {
    create() {
      while (rooms.size >= maxRooms) rooms.delete(rooms.keys().next().value!);
      const id = randomBytes(12).toString("base64url");
      const r: Entry = {
        id,
        bookings: [],
        touchedAt: now(),
        ...defaultSalon(),
        pin: String(randomInt(0, 10_000)).padStart(4, "0"),
        stylistSeq: 0,
        pinFails: [],
        listeners: new Set(),
      };
      r.bookings = seedBookings(now(), r).map((s) => ({ id: randomBytes(9).toString("base64url"), room: id, ...s }));
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
      const service = r.services.find((s) => s.id === input.service);
      if (!service || service.hidden) throw new BookingError("bad_service");
      if (input.stylist !== "any") stylistOf(r, input.stylist);
      const name = input.name.trim();
      if (!name || [...name].length > MAX_NAME) throw new BookingError("bad_name");
      const phone = input.phone?.trim() || undefined;
      if (phone && [...phone].length > MAX_PHONE) throw new BookingError("bad_phone");
      if (!validStart(input.start, r.settings)) throw new BookingError("bad_start");
      if (r.bookings.length >= maxBookings) throw new BookingError("full");
      expireHolds(r);
      const t = now();
      const stylist: StylistId | null =
        input.stylist === "any" ? freeStylist(r.bookings, input.service, input.start, t, r) : isFree(r.bookings, input.service, input.stylist, input.start, t, r) ? input.stylist : null;
      if (!stylist) throw new BookingError("taken");
      const b: Booking = {
        id: randomBytes(9).toString("base64url"),
        room: id,
        service: input.service,
        stylist,
        start: input.start,
        end: input.start + service.minutes * 60_000,
        name,
        ...(phone && { phone }),
        price: service.price,
        deposit: r.settings.deposit,
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
    updateService(id, patch) {
      const r = must(id);
      const serviceId = patch && typeof patch === "object" ? (patch as { id?: unknown }).id : undefined;
      const cur = r.services.find((s) => s.id === serviceId);
      if (!cur) throw new BookingError("not_found");
      const service = editService(cur, patch);
      setConfig(r, { services: r.services.map((s) => (s === cur ? service : s)) });
      return service;
    },
    updateStylist(id, patch) {
      const r = must(id);
      const stylistId = patch && typeof patch === "object" ? (patch as { id?: unknown }).id : undefined;
      const cur = r.stylists.find((s) => s.id === stylistId);
      if (!cur) throw new BookingError("not_found");
      const stylist = editStylist(cur, patch);
      setConfig(r, { stylists: r.stylists.map((s) => (s === cur ? stylist : s)) });
      return stylist;
    },
    addStylist(id, input) {
      const r = must(id);
      if (r.stylists.length >= MAX_STYLISTS) throw new BookingError("too_many_stylists");
      let stylistId: string;
      do stylistId = `stylist-${++r.stylistSeq}`;
      while (r.stylists.some((s) => s.id === stylistId) || r.bookings.some((b) => b.stylist === stylistId));
      const stylist = newStylist(input, stylistId);
      setConfig(r, { stylists: [...r.stylists, stylist] });
      return stylist;
    },
    setSettings(id, input) {
      const r = must(id);
      const settings = parseSettings(input);
      setConfig(r, { settings });
      return settings;
    },
    cancel(id, bookingId, reason, refund) {
      const r = must(id);
      const cancelReason = parseReason(reason);
      const refunded = parseRefund(refund);
      const b = changeable(r, bookingId);
      // A hold was never paid, so there is no deposit to give back.
      return put(r, { ...b, status: "cancelled", cancelReason, refund: b.status === "booked" && refunded, at: { ...b.at, cancelled: now() } });
    },
    move(id, bookingId, start, stylist) {
      const r = must(id);
      const b = changeable(r, bookingId);
      const st = stylistOf(r, stylist === undefined ? b.stylist : stylist);
      if (!validStart(start, r.settings) || start <= now()) throw new BookingError("bad_start");
      const length = b.end - b.start;
      if (!fits(r.bookings, st, start, length, now(), r.settings, b.id)) throw new BookingError("taken");
      return put(r, { ...b, stylist: st.id, start, end: start + length, movedAt: now() });
    },
    reset(id) {
      const r = must(id);
      setConfig(r, defaultSalon());
      return r;
    },
    login(id, pin) {
      const r = must(id);
      const cutoff = now() - PIN_WINDOW_MS;
      r.pinFails = r.pinFails.filter((t) => t > cutoff);
      touch(r);
      // Once locked, even the right PIN waits, so guessing can't go on behind the 429s.
      if (r.pinFails.length >= PIN_TRIES) return "locked";
      if (typeof pin === "string" && pin === r.pin) return "ok";
      r.pinFails.push(now());
      return "wrong";
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
