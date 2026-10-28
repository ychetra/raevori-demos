import { describe, expect, test } from "vitest";
import { availability, freeStylist } from "@/features/booking/availability";
import { AdminError, bookingsCsv, MAX_STYLISTS } from "@/features/booking/admin";
import { DEFAULT_SETTINGS, DEFAULT_STYLISTS, defaultSalon, SERVICES, STYLISTS } from "@/features/booking/salon";
import { BookingError, createMemoryStore } from "@/features/booking/store";
import type { Booking, BookingEvent, HoldInput, SalonConfig } from "@/features/booking/types";

const H = 60 * 60 * 1000;
const M = 60 * 1000;
const DAY = 24 * H;
/** 2026-10-28 00:00 Phnom Penh, a Wednesday (weekday 3); tomorrow is a Thursday (4). */
const D = Date.UTC(2026, 9, 28) - 7 * H;
const TOMORROW = D + DAY;
const at = (h: number, m = 0, day = D) => day + h * H + m * M;
const hhmm = (ms: number) => new Date(ms + 7 * H).toISOString().slice(11, 16);
/** Before the day opens, so nothing is in the past. */
const EARLY = at(6, 0, TOMORROW);

const clock = (start = at(14)) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
function open() {
  const c = clock();
  const store = createMemoryStore({ now: c.now });
  const id = store.create().id;
  return { c, store, id };
}
/** A salon config with `change` applied to a fresh default copy. */
const salonWith = (change: (s: SalonConfig) => void) => {
  const s = defaultSalon();
  change(s);
  return s;
};
const haircut = (start: number, stylist: HoldInput["stylist"] = "bopha", name = "Sophea"): HoldInput => ({ service: "haircut", stylist, start, name });
/** Tomorrow's first free start for `stylist` in the room, at the store's 14:00 today. */
const firstFree = (store: ReturnType<typeof createMemoryStore>, id: string, stylist: HoldInput["stylist"] = "bopha", service: HoldInput["service"] = "haircut") => {
  const r = store.get(id)!;
  return availability(r.bookings, service, stylist, TOMORROW, at(14), r)[0];
};

describe("per-room salon config", () => {
  test("a new room gets copies of the default services, stylists and settings, and a random 4-digit PIN", () => {
    const { store, id } = open();
    const room = store.get(id)!;
    expect(room.services).toEqual(SERVICES);
    expect(room.services).not.toBe(SERVICES);
    expect(room.services[0]).not.toBe(SERVICES[0]);
    expect(room.stylists).toEqual(DEFAULT_STYLISTS);
    expect(room.stylists.map((s) => s.id)).toEqual(STYLISTS);
    expect(room.stylists[0]).toEqual({ id: "bopha", name: { en: "Bopha", km: "បុប្ផា" }, daysOff: [], hours: null });
    expect(room.settings).toEqual({ name: "Bopha Beauty", open: "09:00", close: "19:00", deposit: 3 });
    expect(room.settings).toEqual(DEFAULT_SETTINGS);
    expect(room.pin).toMatch(/^\d{4}$/);
    const pins = new Set(Array.from({ length: 20 }, () => store.get(store.create().id)!.pin));
    expect(pins.size).toBeGreaterThan(1);
  });

  test("room A's edits touch neither room B nor the defaults", () => {
    const { store, id: a } = open();
    const b = store.create().id;
    const before = structuredClone({ SERVICES, DEFAULT_STYLISTS, DEFAULT_SETTINGS });
    store.updateService(a, { id: "haircut", price: 10, minutes: 60, hidden: true });
    store.updateStylist(a, { id: "bopha", name: { en: "Bo", km: "បូ" }, daysOff: [4], hours: { start: "10:00", end: "16:00" } });
    store.addStylist(a, { name: { en: "Nita", km: "នីតា" } });
    store.setSettings(a, { name: "Lotus Spa", open: "10:00", close: "18:00", deposit: 5 });
    expect(store.get(a)!.services[0]).toEqual({ id: "haircut", price: 10, minutes: 60, hidden: true });
    expect(store.get(a)!.stylists).toHaveLength(4);
    expect(store.get(b)!.services).toEqual(SERVICES);
    expect(store.get(b)!.stylists).toEqual(DEFAULT_STYLISTS);
    expect(store.get(b)!.settings).toEqual(DEFAULT_SETTINGS);
    expect({ SERVICES, DEFAULT_STYLISTS, DEFAULT_SETTINGS }).toEqual(before);
    // A fresh copy each time, never the shared defaults.
    expect(defaultSalon().stylists[0].daysOff).not.toBe(defaultSalon().stylists[0].daysOff);
  });

  test("seeded bookings carry the default price and deposit", () => {
    const { store, id } = open();
    for (const b of store.get(id)!.bookings) {
      expect(b.price).toBe(SERVICES.find((s) => s.id === b.service)!.price);
      expect(b.deposit).toBe(3);
    }
  });
});

describe("availability uses the room's config", () => {
  test("a stylist's day off: no starts that day, and Anyone picks from those working", () => {
    const salon = salonWith((s) => { s.stylists[0].daysOff = [4]; });
    expect(availability([], "haircut", "bopha", TOMORROW, EARLY, salon)).toEqual([]);
    expect(availability([], "haircut", "bopha", D + 2 * DAY, EARLY, salon)).toHaveLength(20);
    expect(freeStylist([], "haircut", at(10, 0, TOMORROW), EARLY, salon)).toBe("dara");
    const allOff = salonWith((s) => { for (const st of s.stylists) st.daysOff = [4]; });
    expect(availability([], "haircut", "any", TOMORROW, EARLY, allOff)).toEqual([]);
  });

  test("a stylist's hours, inside the salon's hours", () => {
    const salon = salonWith((s) => { s.stylists[1].hours = { start: "12:00", end: "15:00" }; });
    expect(availability([], "haircut", "dara", TOMORROW, EARLY, salon).map(hhmm)).toEqual(["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"]);
    expect(availability([], "manicure", "dara", TOMORROW, EARLY, salon).map(hhmm).at(-1)).toBe("14:00");
    // Hours wider than the salon's are cut to the salon's.
    const wide = salonWith((s) => { s.settings.open = "10:00"; s.settings.close = "17:30"; s.stylists[1].hours = { start: "08:00", end: "22:00" }; });
    const free = availability([], "haircut", "dara", TOMORROW, EARLY, wide).map(hhmm);
    expect([free[0], free.at(-1)]).toEqual(["10:00", "17:00"]);
  });

  test("a hidden service has no starts, for any stylist", () => {
    const salon = salonWith((s) => { s.services[0].hidden = true; });
    expect(availability([], "haircut", "any", TOMORROW, EARLY, salon)).toEqual([]);
    expect(availability([], "haircut", "bopha", TOMORROW, EARLY, salon)).toEqual([]);
    expect(availability([], "wash", "bopha", TOMORROW, EARLY, salon)).toHaveLength(20);
  });

  test("a changed duration moves the last start", () => {
    const salon = salonWith((s) => { s.services[0].minutes = 90; });
    expect(availability([], "haircut", "bopha", TOMORROW, EARLY, salon).map(hhmm).at(-1)).toBe("17:30");
  });

  test("the store's hold applies days off, hours, hidden services and durations", () => {
    const { store, id } = open();
    // Friday (weekday 5) has no seeded bookings, so only the day off is in the way.
    const friday = D + 2 * DAY;
    store.updateStylist(id, { id: "bopha", daysOff: [5] });
    expect(() => store.hold(id, haircut(at(10, 0, friday), "bopha"))).toThrow(new BookingError("taken"));
    expect(store.hold(id, haircut(at(10, 0, friday), "any", "Vanna")).stylist).toBe("dara");
    expect(store.hold(id, haircut(at(10, 0, D + 3 * DAY), "bopha", "Rithy")).stylist).toBe("bopha");

    store.updateService(id, { id: "wash", hidden: true });
    expect(() => store.hold(id, { ...haircut(firstFree(store, id, "dara"), "dara"), service: "wash" })).toThrow(new BookingError("bad_service"));

    store.updateService(id, { id: "manicure", minutes: 120 });
    const long = store.hold(id, { service: "manicure", stylist: "dara", start: at(13, 0, friday), name: "Pisey" });
    expect(long.end - long.start).toBe(120 * M);
    expect(() => store.hold(id, { service: "manicure", stylist: "dara", start: at(17, 30, friday), name: "Pisey" })).toThrow(new BookingError("taken"));

    expect(() => store.hold(id, haircut(firstFree(store, id, "dara"), "sokha"))).toThrow(new BookingError("bad_stylist"));
    const day3 = D + 3 * DAY;
    store.updateStylist(id, { id: "dara", hours: { start: "13:00", end: "19:00" } });
    expect(() => store.hold(id, haircut(at(12, 0, day3), "dara"))).toThrow(new BookingError("taken"));
    expect(store.hold(id, haircut(at(13, 0, day3), "dara")).stylist).toBe("dara");
  });
});

describe("stylists follow the salon's hours unless set", () => {
  const friday = D + 2 * DAY;
  test("after the salon widens to 07:00-21:00, a following stylist offers 07:00 and a hold at 07:00 succeeds", () => {
    const { store, id } = open();
    store.setSettings(id, { ...DEFAULT_SETTINGS, open: "07:00", close: "21:00" });
    const r = store.get(id)!;
    const free = availability(r.bookings, "haircut", "bopha", friday, at(14), r).map(hhmm);
    expect([free[0], free.at(-1)]).toEqual(["07:00", "20:30"]);
    expect(store.hold(id, haircut(at(7, 0, friday), "bopha")).stylist).toBe("bopha");
    expect(store.hold(id, haircut(at(20, 30, friday), "dara")).stylist).toBe("dara");
  });

  test("a stylist with custom 10:00-16:00 keeps them when the salon widens", () => {
    const { store, id } = open();
    store.updateStylist(id, { id: "dara", hours: { start: "10:00", end: "16:00" } });
    store.setSettings(id, { ...DEFAULT_SETTINGS, open: "07:00", close: "21:00" });
    const r = store.get(id)!;
    const free = availability(r.bookings, "haircut", "dara", friday, at(14), r).map(hhmm);
    expect([free[0], free.at(-1)]).toEqual(["10:00", "15:30"]);
    expect(() => store.hold(id, haircut(at(7, 0, friday), "dara"))).toThrow(new BookingError("taken"));
  });

  test("narrowing the salon clips a custom stylist", () => {
    const { store, id } = open();
    store.updateStylist(id, { id: "dara", hours: { start: "10:00", end: "16:00" } });
    store.setSettings(id, { ...DEFAULT_SETTINGS, open: "11:00", close: "15:00" });
    const r = store.get(id)!;
    const free = availability(r.bookings, "haircut", "dara", friday, at(14), r).map(hhmm);
    expect([free[0], free.at(-1)]).toEqual(["11:00", "14:30"]);
  });

  test("hours: null switches a custom stylist back to the salon's hours; new stylists follow the salon", () => {
    const { store, id } = open();
    expect(store.updateStylist(id, { id: "dara", hours: { start: "10:00", end: "16:00" } }).hours).toEqual({ start: "10:00", end: "16:00" });
    expect(store.updateStylist(id, { id: "dara", hours: null }).hours).toBeNull();
    expect(store.addStylist(id, { name: { en: "Nita", km: "នីតា" } }).hours).toBeNull();
    store.setSettings(id, { ...DEFAULT_SETTINGS, open: "07:00" });
    const r = store.get(id)!;
    expect(availability(r.bookings, "haircut", "dara", friday, at(14), r).map(hhmm)[0]).toBe("07:00");
  });
});

describe("prices", () => {
  test("a booking keeps the price and deposit it was held at", () => {
    const { store, id } = open();
    const h = store.hold(id, haircut(firstFree(store, id)));
    expect(h).toMatchObject({ price: 8, deposit: 3 });
    store.updateService(id, { id: "haircut", price: 12.5, minutes: 60 });
    store.setSettings(id, { ...DEFAULT_SETTINGS, deposit: 5 });
    const paid = store.pay(id, h.id);
    expect(paid).toMatchObject({ price: 8, deposit: 3 });
    expect(paid.end - paid.start).toBe(30 * M);
    const next = store.hold(id, haircut(firstFree(store, id), "bopha", "Vanna"));
    expect(next).toMatchObject({ price: 12.5, deposit: 5 });
    expect(next.end - next.start).toBe(60 * M);
    const seeded = store.get(id)!.bookings.find((b) => b.service === "haircut")!;
    expect(seeded.price).toBe(8);
  });
});

describe("cancel", () => {
  test("cancels a booked slot with a reason and a refund, and frees the slot", () => {
    const { store, id } = open();
    const start = firstFree(store, id);
    const b = store.pay(id, store.hold(id, haircut(start)).id);
    expect(availability(store.get(id)!.bookings, "haircut", "bopha", TOMORROW, at(14), store.get(id)!)).not.toContain(start);
    const c = store.cancel(id, b.id, "  Stylist is sick ", true);
    expect(c).toMatchObject({ id: b.id, status: "cancelled", cancelReason: "Stylist is sick", refund: true, at: { cancelled: at(14) } });
    expect(store.get(id)!.bookings.find((x) => x.id === b.id)).toEqual(c);
    expect(availability(store.get(id)!.bookings, "haircut", "bopha", TOMORROW, at(14), store.get(id)!)).toContain(start);
  });

  test("can keep the deposit; a hold can be cancelled (nothing to refund); finished bookings can't", () => {
    const { store, id } = open();
    const b = store.pay(id, store.hold(id, haircut(firstFree(store, id))).id);
    expect(store.cancel(id, b.id, "No reply", false)).toMatchObject({ status: "cancelled", refund: false });
    const h = store.hold(id, haircut(firstFree(store, id), "bopha", "Vanna"));
    expect(store.cancel(id, h.id, "Duplicate", true)).toMatchObject({ status: "cancelled", refund: false });
    expect(() => store.cancel(id, b.id, "again", true)).toThrow(new BookingError("wrong_state"));
    const arrived = store.get(id)!.bookings.find((x) => x.status === "arrived")!;
    expect(() => store.cancel(id, arrived.id, "late", true)).toThrow(new BookingError("wrong_state"));
    expect(() => store.cancel(id, "nope", "x", true)).toThrow(new BookingError("not_found"));
  });

  test("needs a 1-120 character reason and a boolean refund", () => {
    const { store, id } = open();
    const b = store.pay(id, store.hold(id, haircut(firstFree(store, id))).id);
    expect(() => store.cancel(id, b.id, "  ", true)).toThrow(new AdminError("reason"));
    expect(() => store.cancel(id, b.id, "x".repeat(121), true)).toThrow(new AdminError("reason"));
    expect(() => store.cancel(id, b.id, "ok", "yes")).toThrow(new AdminError("refund"));
    expect(store.cancel(id, b.id, "x".repeat(120), true).status).toBe("cancelled");
  });
});

describe("move", () => {
  test("moves to a free start (and stylist), keeping the id, service, length and price", () => {
    const { store, id } = open();
    const b = store.pay(id, store.hold(id, { service: "manicure", stylist: "bopha", start: firstFree(store, id, "bopha", "manicure"), name: "Sophea" }).id);
    store.updateService(id, { id: "manicure", minutes: 30, price: 20 });
    const to = availability(store.get(id)!.bookings, "colour", "dara", D + 3 * DAY, at(14), store.get(id)!)[0];
    const moved = store.move(id, b.id, to, "dara");
    expect(moved).toMatchObject({ id: b.id, service: "manicure", stylist: "dara", start: to, end: to + 60 * M, price: 12, deposit: 3, status: "booked", movedAt: at(14) });
    // Overlapping its own old place is fine: 30 minutes later, same stylist.
    expect(store.move(id, b.id, to + 30 * M)).toMatchObject({ stylist: "dara", start: to + 30 * M, end: to + 90 * M });
  });

  test("a taken start is refused with taken; so are days off and hours", () => {
    const { store, id } = open();
    const b = store.pay(id, store.hold(id, haircut(firstFree(store, id))).id);
    const other = store.get(id)!.bookings.find((x) => x.status === "booked" && x.start > at(14) && x.id !== b.id)!;
    expect(() => store.move(id, b.id, other.start, other.stylist)).toThrow(new BookingError("taken"));
    store.updateStylist(id, { id: "srey-leak", daysOff: [6] });
    const saturday = D + 3 * DAY;
    expect(() => store.move(id, b.id, at(10, 0, saturday), "srey-leak")).toThrow(new BookingError("taken"));
    expect(() => store.move(id, b.id, at(10, 15, saturday))).toThrow(new BookingError("bad_start"));
    expect(() => store.move(id, b.id, at(13))).toThrow(new BookingError("bad_start")); // in the past
    expect(() => store.move(id, b.id, at(10, 0, saturday), "sokha")).toThrow(new BookingError("bad_stylist"));
    expect(() => store.move(id, b.id, "10:00")).toThrow(new BookingError("bad_start"));
    store.cancel(id, b.id, "x", true);
    expect(() => store.move(id, b.id, at(10, 0, saturday))).toThrow(new BookingError("wrong_state"));
  });
});

describe("stylists and services", () => {
  test("adds stylists up to 5, with the salon's hours and no days off", () => {
    const { store, id } = open();
    store.setSettings(id, { ...DEFAULT_SETTINGS, open: "10:00" });
    const a = store.addStylist(id, { name: { en: "Nita", km: "នីតា" } });
    expect(a).toEqual({ id: expect.any(String), name: { en: "Nita", km: "នីតា" }, daysOff: [], hours: null });
    const b = store.addStylist(id, { name: { en: "Mony", km: "មុន្នី" }, daysOff: [0, 0, 6], hours: { start: "12:00", end: "18:00" } });
    expect(b.daysOff).toEqual([0, 6]);
    expect(new Set(store.get(id)!.stylists.map((s) => s.id)).size).toBe(MAX_STYLISTS);
    expect(() => store.addStylist(id, { name: { en: "Six", km: "ប្រាំមួយ" } })).toThrow(new BookingError("too_many_stylists"));
    // "Anyone" tries the new stylists last, in the order they were added.
    const friday = D + 2 * DAY;
    for (const s of STYLISTS) store.hold(id, haircut(at(10, 0, friday), s, s));
    expect(store.hold(id, haircut(at(10, 0, friday), "any")).stylist).toBe(a.id);
    // Mony starts at 12:00, so she is not "Anyone" at 10:30.
    for (const s of STYLISTS) store.hold(id, haircut(at(10, 30, friday), s, s));
    store.hold(id, haircut(at(10, 30, friday), a.id));
    expect(() => store.hold(id, haircut(at(10, 30, friday), "any"))).toThrow(new BookingError("taken"));
  });

  test("rejects bad edits with the field", () => {
    const { store, id } = open();
    const bad: [unknown, string][] = [
      [{ id: "haircut", price: 0 }, "price"],
      [{ id: "haircut", price: 8.25 }, "price"],
      [{ id: "haircut", price: 501 }, "price"],
      [{ id: "haircut", minutes: 45 }, "minutes"],
      [{ id: "haircut", hidden: "yes" }, "hidden"],
    ];
    for (const [patch, field] of bad) expect(() => store.updateService(id, patch)).toThrow(new AdminError(field));
    expect(() => store.updateService(id, { id: "massage", price: 5 })).toThrow(new BookingError("not_found"));
    const badStylist: [unknown, string][] = [
      [{ id: "bopha", name: { en: " ", km: "x" } }, "name"],
      [{ id: "bopha", name: { en: "x".repeat(21), km: "x" } }, "name"],
      [{ id: "bopha", daysOff: [7] }, "daysOff"],
      [{ id: "bopha", daysOff: "Mon" }, "daysOff"],
      [{ id: "bopha", hours: { start: "09:15", end: "18:00" } }, "hours"],
      [{ id: "bopha", hours: { start: "15:00", end: "15:00" } }, "hours"],
    ];
    for (const [patch, field] of badStylist) expect(() => store.updateStylist(id, patch)).toThrow(new AdminError(field));
    expect(() => store.addStylist(id, { daysOff: [] })).toThrow(new AdminError("name"));
    expect(() => store.updateStylist(id, { id: "sokha", daysOff: [] })).toThrow(new BookingError("not_found"));
    expect(store.updateService(id, { id: "haircut", price: 499.5, hidden: false })).toEqual({ id: "haircut", minutes: 30, price: 499.5 });
  });

  test("settings: name, hours on the hour or half hour, open before close, deposit $0-10 in 50-cent steps", () => {
    const { store, id } = open();
    const bad: [unknown, string][] = [
      [{ ...DEFAULT_SETTINGS, name: "" }, "name"],
      [{ ...DEFAULT_SETTINGS, open: "09:15" }, "open"],
      [{ ...DEFAULT_SETTINGS, close: "8pm" }, "close"],
      [{ ...DEFAULT_SETTINGS, open: "12:00", close: "11:30" }, "close"],
      [{ ...DEFAULT_SETTINGS, deposit: 10.5 }, "deposit"],
      [{ ...DEFAULT_SETTINGS, deposit: 2.25 }, "deposit"],
      [{ ...DEFAULT_SETTINGS, deposit: -0.5 }, "deposit"],
      [{ ...DEFAULT_SETTINGS, deposit: "3" }, "deposit"],
    ];
    for (const [input, field] of bad) expect(() => store.setSettings(id, input)).toThrow(new AdminError(field));
    expect(store.setSettings(id, { name: " Lotus Spa ", open: "08:30", close: "20:00", deposit: 0, extra: 1 })).toEqual({ name: "Lotus Spa", open: "08:30", close: "20:00", deposit: 0 });
    expect(store.setSettings(id, { ...DEFAULT_SETTINGS, deposit: 10 }).deposit).toBe(10);
  });
});

describe("events and reset", () => {
  test("every config change is a config event with the whole config and no PIN; moves and cancels are booking events", () => {
    const { store, id } = open();
    const seen: BookingEvent[] = [];
    store.subscribe(id, (e) => seen.push(e));
    store.updateService(id, { id: "haircut", price: 9 });
    store.updateStylist(id, { id: "dara", daysOff: [1] });
    store.addStylist(id, { name: { en: "Nita", km: "នីតា" } });
    store.setSettings(id, { ...DEFAULT_SETTINGS, name: "Lotus Spa" });
    expect(seen).toHaveLength(4);
    for (const e of seen) expect(Object.keys(e).sort()).toEqual(["services", "settings", "stylists", "type"]);
    expect(JSON.stringify(seen)).not.toContain(`"pin"`);
    const last = seen.at(-1) as Extract<BookingEvent, { type: "config" }>;
    expect(last).toEqual({ type: "config", services: store.get(id)!.services, stylists: store.get(id)!.stylists, settings: store.get(id)!.settings });
    expect(last.services[0].price).toBe(9);
    // Events already sent never change afterwards.
    const firstPrice = (seen[0] as typeof last).services[0].price;
    store.updateService(id, { id: "haircut", price: 11 });
    expect((seen[0] as typeof last).services[0].price).toBe(firstPrice);

    const b = store.pay(id, store.hold(id, haircut(firstFree(store, id))).id);
    seen.length = 0;
    store.move(id, b.id, at(10, 0, D + 3 * DAY));
    store.cancel(id, b.id, "Sick", true);
    expect(seen.map((e) => e.type)).toEqual(["booking", "booking"]);
    expect(JSON.stringify(seen)).not.toContain(`"pin"`);
  });

  test("reset restores the default config and keeps the bookings and the PIN", () => {
    const { store, id } = open();
    const pin = store.get(id)!.pin;
    store.updateService(id, { id: "haircut", price: 9 });
    store.updateService(id, { id: "wash", hidden: true });
    store.addStylist(id, { name: { en: "Nita", km: "នីតា" } });
    store.setSettings(id, { ...DEFAULT_SETTINGS, deposit: 0 });
    const b = store.hold(id, haircut(firstFree(store, id)));
    const count = store.get(id)!.bookings.length;
    const seen: BookingEvent[] = [];
    store.subscribe(id, (e) => seen.push(e));
    const r = store.reset(id);
    expect({ services: r.services, stylists: r.stylists, settings: r.settings }).toEqual(defaultSalon());
    expect(r.bookings).toHaveLength(count);
    expect(r.bookings.find((x) => x.id === b.id)).toMatchObject({ price: 9, deposit: 0 });
    expect(r.pin).toBe(pin);
    expect(seen).toEqual([{ type: "config", ...defaultSalon() }]);
  });

  test("PIN login: 5 wrong tries in 10 minutes lock it, even for the right PIN", () => {
    const { c, store, id } = open();
    const pin = store.get(id)!.pin;
    const wrong = pin === "0000" ? "1111" : "0000";
    expect(store.login(id, pin)).toBe("ok");
    expect(store.login(id, Number(pin))).toBe("wrong");
    for (let i = 0; i < 4; i++) expect(store.login(id, wrong)).toBe("wrong");
    expect(store.login(id, pin)).toBe("locked");
    c.tick(10 * 60 * 1000 + 1);
    expect(store.login(id, pin)).toBe("ok");
  });
});

describe("CSV", () => {
  test("has a BOM, an English header, the phone, escaping, and names in the chosen language", () => {
    const salon = defaultSalon();
    const b = (over: Partial<Booking>): Booking => ({
      id: "x", room: "r", service: "haircut", stylist: "bopha", start: at(10, 30, TOMORROW), end: at(11, 0, TOMORROW), name: "Sophea",
      price: 8, deposit: 3, status: "booked", at: {}, ...over,
    });
    const csv = bookingsCsv([
      b({ start: at(15, 0, TOMORROW), name: 'Ly, "Na"', phone: "012 345 678", service: "colour", stylist: "dara", price: 35 }),
      b({}),
      b({ status: "cancelled", refund: true, deposit: 2.5 }),
      b({ status: "cancelled", refund: false }),
      b({ status: "expired" }),
    ], salon, "en");
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).split("\r\n");
    expect(rows[0]).toBe("date,time,customer,phone,stylist,service,price,deposit,status");
    expect(rows).toHaveLength(5); // the expired hold is left out
    expect(rows[1]).toBe("2026-10-29,10:30,Sophea,,Bopha,Haircut,8.00,3.00,booked");
    expect(rows[2]).toBe("2026-10-29,10:30,Sophea,,Bopha,Haircut,8.00,2.50,cancelled (refunded)");
    expect(rows[3]).toBe("2026-10-29,10:30,Sophea,,Bopha,Haircut,8.00,3.00,cancelled (deposit kept)");
    expect(rows[4]).toBe('2026-10-29,15:00,"Ly, ""Na""",012 345 678,Dara,Hair colour,35.00,3.00,booked');
    // Customer-typed text never starts a formula in Excel.
    expect(bookingsCsv([b({ name: "=HYPERLINK(1)", phone: "+855 12" })], salon, "en").split("\r\n")[1]).toBe("2026-10-29,10:30,'=HYPERLINK(1),'+855 12,Bopha,Haircut,8.00,3.00,booked");
    const km = bookingsCsv([b({})], salon, "km");
    expect(km).toContain("បុប្ផា,កាត់សក់");
  });
});
