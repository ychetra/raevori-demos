import { describe, expect, test, vi } from "vitest";
import { availability } from "@/features/booking/availability";
import { CLOSE_HOUR, HOLD_MS, OPEN_HOUR, SERVICE_BY_ID, STYLISTS } from "@/features/booking/salon";
import { BookingError, createMemoryStore } from "@/features/booking/store";
import type { Booking, HoldInput } from "@/features/booking/types";

const H = 60 * 60 * 1000;
const M = 60 * 1000;
const DAY = 24 * H;
/** 2026-10-28 00:00 Phnom Penh. */
const D = Date.UTC(2026, 9, 28) - 7 * H;
const at = (h: number, m = 0, day = D) => day + h * H + m * M;

const clock = (start = at(14)) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
const ppDay = (ms: number) => Math.floor((ms + 7 * H) / DAY);
/** Everything about a seeded booking except its random ids. */
const shape = ({ id: _id, room: _room, ...rest }: Booking) => rest;
const blocking = (bs: Booking[]) => bs.filter((x) => x.status !== "expired");

/** A store at 14:00 PP with one room, and tomorrow's first free start for `stylist` and `service`. */
function setup(stylist: HoldInput["stylist"] = "bopha", service: HoldInput["service"] = "haircut", start = at(14)) {
  const c = clock(start);
  const store = createMemoryStore({ now: c.now });
  const room = store.create();
  const slot = availability(room.bookings, service, stylist, D + DAY, c.now())[0];
  const input: HoldInput = { service, stylist, start: slot, name: "Sophea" };
  /** Another free slot right now (any stylist), for a second hold that must not clash. */
  const next = (name = "Vanna"): HoldInput => ({ service, stylist: "any", start: availability(store.get(room.id)!.bookings, service, "any", D + DAY, c.now())[0], name });
  return { c, store, id: room.id, slot, input, next };
}

describe("seeding", () => {
  test("a new room has an unguessable id and bookings for today and tomorrow only", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const r = store.create();
    expect(r.id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(store.create().id).not.toBe(r.id);
    const days = new Set(r.bookings.map((x) => ppDay(x.start)));
    expect([...days].sort()).toEqual([ppDay(D), ppDay(D) + 1]);
    for (const x of r.bookings) {
      expect(x.room).toBe(r.id);
      expect(x.id).toMatch(/^[A-Za-z0-9_-]{12,}$/);
      expect(x.end - x.start).toBe(SERVICE_BY_ID[x.service].minutes * M);
      const dayStart = Math.floor((x.start + 7 * H) / DAY) * DAY - 7 * H;
      expect(x.start).toBeGreaterThanOrEqual(dayStart + OPEN_HOUR * H);
      expect(x.end).toBeLessThanOrEqual(dayStart + CLOSE_HOUR * H);
      expect((x.start - dayStart) % (30 * M)).toBe(0);
      expect(x.name).toMatch(/^[A-Z][a-z]+$/);
      expect(x.phone).toBeUndefined();
      for (const t of Object.values(x.at)) expect(t).toBeLessThanOrEqual(c.now());
    }
    expect(new Set(r.bookings.map((x) => x.id)).size).toBe(r.bookings.length);
    expect(new Set(r.bookings.map((x) => x.service)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(r.bookings.map((x) => x.name)).size).toBeGreaterThanOrEqual(8);
  });

  test("bookings never overlap for one stylist", () => {
    const r = createMemoryStore({ now: clock().now }).create();
    for (const s of STYLISTS) {
      const mine = r.bookings.filter((x) => x.stylist === s).sort((a, b) => a.start - b.start);
      for (let i = 1; i < mine.length; i++) expect(mine[i].start).toBeGreaterThanOrEqual(mine[i - 1].end);
    }
  });

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])("about half of each day's slots are booked (day +%i)", (n) => {
    const r = createMemoryStore({ now: clock(at(12, 0, D + n * DAY)).now }).create();
    for (const day of [D + n * DAY, D + (n + 1) * DAY]) {
      const minutes = r.bookings.filter((x) => x.start >= day && x.start < day + DAY).reduce((m, x) => m + (x.end - x.start) / M, 0);
      const share = minutes / (3 * (CLOSE_HOUR - OPEN_HOUR) * 60);
      expect(share).toBeGreaterThanOrEqual(0.4);
      expect(share).toBeLessThanOrEqual(0.6);
    }
  });

  test("is deterministic given now", () => {
    const a = createMemoryStore({ now: clock().now }).create();
    const b = createMemoryStore({ now: clock().now }).create();
    expect(b.bookings.map(shape)).toEqual(a.bookings.map(shape));
    const later = createMemoryStore({ now: clock(at(14, 0, D + DAY)).now }).create();
    expect(later.bookings.map(shape)).not.toEqual(a.bookings.map(shape));
  });

  test("at 14:00 today's finished bookings arrived except exactly one no-show; the rest are booked", () => {
    const c = clock(at(14));
    const r = createMemoryStore({ now: c.now }).create();
    const ended = r.bookings.filter((x) => x.end <= c.now());
    const rest = r.bookings.filter((x) => x.end > c.now());
    expect(ended.length).toBeGreaterThan(3);
    expect(ended.filter((x) => x.status === "noshow")).toHaveLength(1);
    expect(ended.filter((x) => x.status === "arrived")).toHaveLength(ended.length - 1);
    expect(rest.every((x) => x.status === "booked")).toBe(true);
    expect(rest.some((x) => ppDay(x.start) === ppDay(D))).toBe(true);
    for (const x of r.bookings) expect(x.at.booked).toBeDefined();
    for (const x of ended) expect(x.at[x.status]).toBeGreaterThanOrEqual(x.start);
  });

  test("at 23:30 (closed) it still seeds today and tomorrow: today all done with one no-show, tomorrow booked", () => {
    const c = clock(at(23, 30));
    const r = createMemoryStore({ now: c.now }).create();
    const today = r.bookings.filter((x) => ppDay(x.start) === ppDay(D));
    const tomorrow = r.bookings.filter((x) => ppDay(x.start) === ppDay(D) + 1);
    expect(today.length).toBeGreaterThan(10);
    expect(tomorrow.length).toBeGreaterThan(10);
    expect(today.filter((x) => x.status === "noshow")).toHaveLength(1);
    expect(today.filter((x) => x.status === "arrived")).toHaveLength(today.length - 1);
    expect(tomorrow.every((x) => x.status === "booked")).toBe(true);
  });

  test("before opening nothing has happened yet: no arrivals, no no-show", () => {
    const r = createMemoryStore({ now: clock(at(6)).now }).create();
    expect(r.bookings.map((x) => ppDay(x.start))).toContain(ppDay(D));
    expect(r.bookings.every((x) => x.status === "booked")).toBe(true);
  });
});

describe("holds", () => {
  test("a hold is held for 5 minutes, stamped, trimmed, sent to subscribers and stored", () => {
    const { c, store, id, input } = setup();
    const fn = vi.fn();
    store.subscribe(id, fn);
    const h = store.hold(id, { ...input, name: "  Sophea  ", phone: " 012 345 678 " });
    expect(h).toMatchObject({ room: id, service: "haircut", stylist: "bopha", start: input.start, end: input.start + 30 * M, name: "Sophea", phone: "012 345 678", status: "held", holdUntil: c.now() + HOLD_MS, at: { held: c.now() } });
    expect(h.id).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect(fn).toHaveBeenCalledWith({ type: "booking", booking: h });
    expect(store.get(id)!.bookings.at(-1)).toEqual(h);
  });

  test("an empty phone is left out", () => {
    const { store, id, input } = setup();
    expect(store.hold(id, { ...input, phone: "   " }).phone).toBeUndefined();
  });

  test("two holds on the same slot: the first wins, the second is taken", () => {
    const { store, id, input } = setup();
    expect(store.hold(id, input).status).toBe("held");
    expect(() => store.hold(id, { ...input, name: "Vanna" })).toThrow(new BookingError("taken"));
    // A longer service over the held slot is taken too.
    expect(() => store.hold(id, { ...input, service: "colour" })).toThrow(new BookingError("taken"));
  });

  test("anyone is resolved to the first free stylist in roster order", () => {
    const { store, id, input } = setup("any");
    const free = STYLISTS.filter((s) => availability(store.get(id)!.bookings, "haircut", s, D + DAY, at(14)).includes(input.start));
    const h1 = store.hold(id, input);
    expect(h1.stylist).toBe(free[0]);
    if (free.length > 1) expect(store.hold(id, input).stylist).toBe(free[1]);
  });

  test("anyone with every stylist busy is taken", () => {
    const { store, id, input } = setup("any");
    for (let i = 0; i < 3; i++) {
      try { store.hold(id, input); } catch { break; }
    }
    expect(() => store.hold(id, input)).toThrow(new BookingError("taken"));
  });

  test("an expired hold frees the slot and is marked expired", () => {
    const { c, store, id, input } = setup();
    const first = store.hold(id, input);
    c.tick(HOLD_MS - 1);
    expect(() => store.hold(id, input)).toThrow(new BookingError("taken"));
    c.tick(1);
    const second = store.hold(id, { ...input, name: "Vanna" });
    expect(second.status).toBe("held");
    expect(store.get(id)!.bookings.find((x) => x.id === first.id)).toMatchObject({ status: "expired", at: { expired: c.now() } });
  });

  test("a start in the past is taken", () => {
    const { store, id } = setup();
    expect(() => store.hold(id, { service: "haircut", stylist: "any", start: at(13, 30), name: "Pisey" })).toThrow(new BookingError("taken"));
  });

  test.each<[string, Partial<HoldInput>, string]>([
    ["an empty name", { name: "" }, "bad_name"],
    ["a blank name", { name: "   " }, "bad_name"],
    ["a 41-character name", { name: "a".repeat(41) }, "bad_name"],
    ["a 21-character phone", { phone: "0".repeat(21) }, "bad_phone"],
    ["an off-grid start", { start: at(10, 15, D + DAY) }, "bad_start"],
    ["a fractional start", { start: at(10, 0, D + DAY) + 0.5 }, "bad_start"],
    ["a start before opening", { start: at(8, 30, D + DAY) }, "bad_start"],
    ["a start at closing", { start: at(19, 0, D + DAY) }, "bad_start"],
    ["a start 7 days ahead", { start: at(10, 0, D + 7 * DAY) }, "bad_start"],
    ["a start yesterday", { start: at(10, 0, D - DAY) }, "bad_start"],
  ])("%s is %s", (_n, patch, code) => {
    const { store, id, input } = setup();
    expect(() => store.hold(id, { ...input, ...patch })).toThrow(new BookingError(code as BookingError["code"]));
  });

  test("a 40-character name, a 20-character phone and the 7th day are fine", () => {
    const { store, id, input } = setup();
    expect(store.hold(id, { ...input, name: "a".repeat(40), phone: "0".repeat(20) }).status).toBe("held");
    expect(store.hold(id, { ...input, start: at(10, 0, D + 6 * DAY) }).status).toBe("held");
  });

  test("a colour that would run past 19:00 is taken", () => {
    const { store, id, input } = setup();
    expect(() => store.hold(id, { ...input, service: "colour", stylist: "any", start: at(18, 0, D + 3 * DAY) })).toThrow(new BookingError("taken"));
    expect(store.hold(id, { ...input, service: "colour", stylist: "any", start: at(17, 30, D + 3 * DAY) }).status).toBe("held");
  });

  test("unknown room is not_found", () => {
    const { store, input } = setup();
    expect(() => store.hold("nope", input)).toThrow(new BookingError("not_found"));
    expect(() => store.pay("nope", "x")).toThrow(new BookingError("not_found"));
    expect(() => store.setStatus("nope", "x", "arrived")).toThrow(new BookingError("not_found"));
    expect(() => store.subscribe("nope", () => {})).toThrow(new BookingError("not_found"));
  });

  test("a room takes 200 bookings in all and refuses the next", () => {
    const { store, id } = setup();
    let left = 200 - store.get(id)!.bookings.length;
    for (let d = 0; d < 7 && left > 0; d++) {
      for (const s of STYLISTS) {
        for (const start of availability(store.get(id)!.bookings, "haircut", s, D + d * DAY, at(14))) {
          if (left-- <= 0) break;
          store.hold(id, { service: "haircut", stylist: s, start, name: "Vanna" });
        }
      }
    }
    expect(store.get(id)!.bookings).toHaveLength(200);
    const free = availability(store.get(id)!.bookings, "haircut", "any", D + 6 * DAY, at(14))[0];
    expect(free).toBeDefined();
    expect(() => store.hold(id, { service: "haircut", stylist: "any", start: free, name: "Vanna" })).toThrow(new BookingError("full"));
  });
});

describe("pay", () => {
  test("paying a live hold books it", () => {
    const { c, store, id, input } = setup();
    const h = store.hold(id, input);
    c.tick(HOLD_MS - 1);
    const fn = vi.fn();
    store.subscribe(id, fn);
    const paid = store.pay(id, h.id);
    expect(paid).toMatchObject({ id: h.id, status: "booked", at: { held: h.at.held, booked: c.now() } });
    expect(fn).toHaveBeenCalledWith({ type: "booking", booking: paid });
    // A booked slot stays taken after the hold time.
    c.tick(HOLD_MS);
    expect(() => store.hold(id, input)).toThrow(new BookingError("taken"));
  });

  test("paying twice returns the booking and sends nothing new", () => {
    const { store, id, input } = setup();
    const h = store.hold(id, input);
    const paid = store.pay(id, h.id);
    const fn = vi.fn();
    store.subscribe(id, fn);
    expect(store.pay(id, h.id)).toEqual(paid);
    expect(fn).not.toHaveBeenCalled();
  });

  test("paying once the hold has run out is expired, and the hold is marked expired", () => {
    const { c, store, id, input } = setup();
    const h = store.hold(id, input);
    c.tick(HOLD_MS);
    const fn = vi.fn();
    store.subscribe(id, fn);
    expect(() => store.pay(id, h.id)).toThrow(new BookingError("expired"));
    expect(fn).toHaveBeenCalledWith({ type: "booking", booking: expect.objectContaining({ id: h.id, status: "expired" }) });
    expect(() => store.pay(id, h.id)).toThrow(new BookingError("expired"));
  });

  test("paying an unknown hold is not_found", () => {
    const { store, id } = setup();
    expect(() => store.pay(id, "nope")).toThrow(new BookingError("not_found"));
  });
});

describe("staff status", () => {
  test("a booked slot can be marked arrived or no-show, once", () => {
    const { c, store, id, input, next } = setup();
    const a = store.pay(id, store.hold(id, input).id);
    const b = store.pay(id, store.hold(id, next()).id);
    c.tick(1000);
    expect(store.setStatus(id, a.id, "arrived")).toMatchObject({ status: "arrived", at: { arrived: c.now() } });
    expect(store.setStatus(id, b.id, "noshow")).toMatchObject({ status: "noshow", at: { noshow: c.now() } });
    expect(() => store.setStatus(id, a.id, "noshow")).toThrow(new BookingError("wrong_state"));
    expect(() => store.setStatus(id, b.id, "arrived")).toThrow(new BookingError("wrong_state"));
  });

  test("a held or expired slot cannot be marked", () => {
    const { c, store, id, input } = setup();
    const h = store.hold(id, input);
    expect(() => store.setStatus(id, h.id, "arrived")).toThrow(new BookingError("wrong_state"));
    c.tick(HOLD_MS);
    expect(() => store.setStatus(id, h.id, "noshow")).toThrow(new BookingError("wrong_state"));
    expect(() => store.setStatus(id, "nope", "arrived")).toThrow(new BookingError("not_found"));
  });

  test("seeded booked slots can be marked too", () => {
    const { store, id } = setup();
    const seeded = store.get(id)!.bookings.find((x) => x.status === "booked")!;
    expect(store.setStatus(id, seeded.id, "arrived").status).toBe("arrived");
  });
});

describe("live updates and expiry", () => {
  test("a listener that throws is dropped and does not break the hold or other listeners", () => {
    const { store, id, input } = setup();
    const broken = vi.fn(() => { throw new Error("Invalid state: Controller is already closed"); });
    const fn = vi.fn();
    store.subscribe(id, broken);
    store.subscribe(id, fn);
    const h = store.hold(id, input);
    expect(store.get(id)!.bookings.some((x) => x.id === h.id)).toBe(true);
    expect(fn).toHaveBeenCalledWith({ type: "booking", booking: h });
    store.pay(id, h.id);
    expect(broken).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("unsubscribing stops events", () => {
    const { store, id, input } = setup();
    const fn = vi.fn();
    const off = store.subscribe(id, fn);
    off();
    store.hold(id, input);
    expect(fn).not.toHaveBeenCalled();
  });

  test("sweep marks run-out holds expired and sends them; live holds are untouched", () => {
    const { c, store, id, input, next } = setup();
    const old = store.hold(id, input);
    c.tick(60_000);
    const live = store.hold(id, next());
    const fn = vi.fn();
    store.subscribe(id, fn);
    c.tick(HOLD_MS - 60_000);
    store.sweep();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ type: "booking", booking: { ...old, status: "expired", at: { ...old.at, expired: c.now() } } });
    expect(blocking(store.get(id)!.bookings).map((x) => x.id)).toContain(live.id);
    store.sweep();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("reading a room expires its run-out holds too", () => {
    const { c, store, id, input } = setup();
    const h = store.hold(id, input);
    const fn = vi.fn();
    store.subscribe(id, fn);
    c.tick(HOLD_MS);
    expect(store.get(id)!.bookings.find((x) => x.id === h.id)!.status).toBe("expired");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("sweep removes rooms idle for more than 2 hours; activity keeps them alive", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const idle = store.create().id;
    const busy = store.create().id;
    c.tick(90 * M);
    const start = availability(store.get(busy)!.bookings, "haircut", "any", D + DAY, c.now())[0];
    store.hold(busy, { service: "haircut", stylist: "any", start, name: "Rachana" });
    c.tick(30 * M);
    store.sweep();
    expect(store.get(idle)).toBeDefined();
    c.tick(1);
    store.sweep();
    expect(store.get(idle)).toBeUndefined();
    expect(store.get(busy)).toBeDefined();
  });

  test("creating room 501 evicts the least recently touched room", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const ids: string[] = [];
    for (let i = 0; i < 500; i++) { ids.push(store.create().id); c.tick(1); }
    const start = availability(store.get(ids[0])!.bookings, "haircut", "any", D + DAY, c.now())[0];
    store.hold(ids[0], { service: "haircut", stylist: "any", start, name: "Pisey" }); // touch the oldest
    store.create();
    expect(store.get(ids[0])).toBeDefined();
    expect(store.get(ids[1])).toBeUndefined();
  });
});
