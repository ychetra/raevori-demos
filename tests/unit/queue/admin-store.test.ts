import { describe, expect, test, vi } from "vitest";
import { AdminError, DEFAULT_SETTINGS, defaultConfig, MAX_SERVICES, queueStats, ticketsCsv } from "@/features/queue/admin";
import { createMemoryStore, estimateWait, QueueError, waitMinutes } from "@/features/queue/store";
import type { ServiceConfig, Ticket } from "@/features/queue/types";
import { PP_OFFSET_MS } from "@/features/shop-pulse/time";

/** Epoch ms of a Phnom Penh wall-clock time on 28 Oct 2026 (or `day`). */
const pp = (h: number, min = 0, day = 28) => Date.UTC(2026, 9, day, h, min) - PP_OFFSET_MS;
const clock = (start = pp(12)) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
const open = (opts: { random?: () => number } = {}) => {
  const c = clock();
  const store = createMemoryStore({ now: c.now, ...opts });
  return { c, store, id: store.create().id };
};
const waiting = (store: ReturnType<typeof createMemoryStore>, id: string) => store.get(id)!.tickets.filter((t) => t.status === "waiting");
const counter = (n: number, open = true) => ({ name: { en: `Counter ${n}`, km: `បញ្ជរ ${n}` }, open });

describe("room config", () => {
  test("a new room gets the default services, two open counters, the default settings and a random PIN", () => {
    const { store, id } = open();
    const q = store.get(id)!;
    expect(q.services).toEqual([
      { id: "repair", name: { en: "Repair", km: "ជួសជុល" }, prefix: "R", minutes: 3 },
      { id: "pickup", name: { en: "Pick up", km: "មកយក" }, prefix: "P", minutes: 3 },
      { id: "payment", name: { en: "Payment", km: "បង់ប្រាក់" }, prefix: "C", minutes: 3 },
    ]);
    expect(q.counters).toEqual([
      { id: 1, name: { en: "Counter 1", km: "បញ្ជរ 1" }, open: true },
      { id: 2, name: { en: "Counter 2", km: "បញ្ជរ 2" }, open: true },
    ]);
    expect(q.settings).toEqual({ name: "Sokha Phone Repair", autoCall: 20 });
    expect(q.settings).toEqual(DEFAULT_SETTINGS);
    expect({ services: q.services, counters: q.counters, settings: q.settings }).toEqual(defaultConfig());
    expect(q.pin).toMatch(/^\d{4}$/);
    const pins = new Set(Array.from({ length: 20 }, () => store.get(store.create().id)!.pin));
    expect(pins.size).toBeGreaterThan(1);
  });

  test("editing room A's config touches neither room B nor the defaults", () => {
    const { store, id: a } = open();
    const b = store.create().id;
    store.updateService(a, { id: "repair", name: { en: "Fix", km: "ជួស" }, prefix: "F", minutes: 10, hidden: true });
    store.addService(a, { name: { en: "Trade-in", km: "ប្តូរ" }, prefix: "T" });
    store.setCounters(a, [counter(1, false), counter(2), counter(3)]);
    store.setSettings(a, { name: "Dara Mobile", autoCall: 0 });
    expect(store.get(a)!.services).toHaveLength(4);
    expect(store.get(b)!.services).toEqual(defaultConfig().services);
    expect(store.get(b)!.counters).toEqual(defaultConfig().counters);
    expect(store.get(b)!.settings).toEqual(DEFAULT_SETTINGS);
    expect(defaultConfig().services[0]).toMatchObject({ id: "repair", prefix: "R", minutes: 3 });
    expect(store.get(b)!.services).not.toBe(store.get(store.create().id)!.services);
  });
});

describe("services", () => {
  test("taking a hidden service is refused with hidden; showing it again works", () => {
    const { store, id } = open();
    store.updateService(id, { id: "pickup", hidden: true });
    expect(() => store.take(id, "pickup")).toThrow(new QueueError("hidden"));
    store.updateService(id, { id: "pickup", hidden: false });
    expect(store.take(id, "pickup").number).toBe("P-008");
    expect(store.get(id)!.services.find((s) => s.id === "pickup")).not.toHaveProperty("hidden");
  });

  test("an unknown service is refused with bad_service", () => {
    const { store, id } = open();
    expect(() => store.take(id, "haircut")).toThrow(new QueueError("bad_service"));
    expect(() => store.take(id, "toString")).toThrow(new QueueError("bad_service"));
  });

  test("walk-ins only pick visible services", () => {
    const { store, id } = open();
    store.updateService(id, { id: "repair", hidden: true });
    store.updateService(id, { id: "payment", hidden: true });
    for (let i = 0; i < 30; i++) store.call(id, ((i % 2) + 1) as 1 | 2, { topUp: true });
    const walkIns = store.get(id)!.tickets.slice(6);
    expect(walkIns.length).toBeGreaterThan(10);
    expect(new Set(walkIns.map((t) => t.service))).toEqual(new Set(["pickup"]));
  });

  test("with every service hidden, auto-call adds no walk-ins", () => {
    const { store, id } = open();
    for (const s of ["repair", "pickup", "payment"]) store.updateService(id, { id: s, hidden: true });
    for (let i = 0; i < 6; i++) store.call(id, 1, { topUp: true });
    expect(store.get(id)!.tickets).toHaveLength(6);
    expect(waiting(store, id)).toHaveLength(0);
  });

  test("numbers use the room's prefix; each prefix counts on its own", () => {
    const { store, id } = open();
    store.updateService(id, { id: "repair", prefix: "x" });
    expect(store.take(id, "repair").number).toBe("X-001");
    expect(store.take(id, "repair").number).toBe("X-002");
    const added = store.addService(id, { name: { en: "Trade-in", km: "ប្តូរ" }, prefix: "T", minutes: 5 });
    expect(added).toEqual({ id: expect.any(String), name: { en: "Trade-in", km: "ប្តូរ" }, prefix: "T", minutes: 5 });
    expect(store.take(id, added.id)).toMatchObject({ number: "T-001", service: added.id });
    // R is free again: it carries on from the seeded R tickets, so no number repeats.
    store.updateService(id, { id: "pickup", prefix: "R" });
    expect(store.take(id, "pickup").number).toBe("R-015");
    expect(store.take(store.create().id, "repair").number).toBe("R-015");
  });

  test("prefixes are unique per room, one letter A-Z", () => {
    const { store, id } = open();
    expect(() => store.updateService(id, { id: "repair", prefix: "P" })).toThrow(new QueueError("prefix_taken"));
    expect(() => store.addService(id, { name: { en: "x", km: "x" }, prefix: "c" })).toThrow(new QueueError("prefix_taken"));
    // Keeping its own prefix is fine.
    expect(store.updateService(id, { id: "repair", prefix: "R", minutes: 4 })).toMatchObject({ prefix: "R", minutes: 4 });
    for (const prefix of ["", "AB", "1", "Ä", "-", 7]) expect(() => store.updateService(id, { id: "repair", prefix })).toThrow(new AdminError("prefix"));
    expect(store.get(id)!.services[0].prefix).toBe("R");
  });

  test("a room has at most 6 services", () => {
    const { store, id } = open();
    for (const prefix of ["D", "E", "F"]) store.addService(id, { name: { en: prefix, km: prefix }, prefix });
    expect(store.get(id)!.services).toHaveLength(MAX_SERVICES);
    expect(MAX_SERVICES).toBe(6);
    expect(() => store.addService(id, { name: { en: "G", km: "G" }, prefix: "G" })).toThrow(new QueueError("too_many_services"));
    expect(new Set(store.get(id)!.services.map((s) => s.id)).size).toBe(6);
  });

  test.each([
    ["empty name", { name: { en: " ", km: "x" } }, "name"],
    ["41-char name", { name: { en: "x".repeat(41), km: "x" } }, "name"],
    ["no Khmer name", { name: { en: "x" } }, "name"],
    ["0 minutes", { minutes: 0 }, "minutes"],
    ["31 minutes", { minutes: 31 }, "minutes"],
    ["2.5 minutes", { minutes: 2.5 }, "minutes"],
    ["hidden not boolean", { hidden: "yes" }, "hidden"],
  ])("a service edit with %s is invalid", (_name, patch, field) => {
    const { store, id } = open();
    expect(() => store.updateService(id, { id: "repair", ...patch })).toThrow(new AdminError(field));
    expect(store.get(id)!.services[0]).toEqual(defaultConfig().services[0]);
  });

  test("a new service needs a name and a prefix; minutes default to 3; editing an unknown one is not_found", () => {
    const { store, id } = open();
    expect(() => store.addService(id, { prefix: "D" })).toThrow(new AdminError("name"));
    expect(() => store.addService(id, { name: { en: "x", km: "x" } })).toThrow(new AdminError("prefix"));
    expect(store.addService(id, { id: "repair", name: { en: " Unlock ", km: "ដោះ" }, prefix: "U" } as never)).toMatchObject({ name: { en: "Unlock" }, minutes: 3 });
    expect(store.get(id)!.services.filter((s) => s.id === "repair")).toHaveLength(1);
    expect(() => store.updateService(id, { id: "nope", minutes: 4 })).toThrow(new QueueError("not_found"));
    expect(() => store.updateService(id, { minutes: 4 })).toThrow(new AdminError("id"));
  });
});

describe("wait estimate", () => {
  const t = (id: string, service: string, waitingAt: number, status: Ticket["status"] = "waiting"): Ticket => ({ id, room: "q", number: id, service, status, at: { waiting: waitingAt } });
  const services: ServiceConfig[] = [
    { id: "repair", name: { en: "Repair", km: "x" }, prefix: "R", minutes: 10 },
    { id: "pickup", name: { en: "Pick up", km: "x" }, prefix: "P", minutes: 2 },
  ];

  test("sums the service minutes of each waiting ticket ahead", () => {
    const tickets = [t("a", "repair", 1), t("b", "pickup", 2), t("x", "repair", 3, "called"), t("c", "pickup", 4), t("d", "repair", 5)];
    expect(estimateWait(tickets, services, "a")).toBe(0);
    expect(estimateWait(tickets, services, "b")).toBe(10);
    expect(estimateWait(tickets, services, "c")).toBe(12);
    expect(estimateWait(tickets, services, "d")).toBe(14);
    // Without a ticket: the whole line, what a new number would wait.
    expect(estimateWait(tickets, services)).toBe(24);
    // An unknown service counts the default 3 minutes.
    expect(estimateWait([t("a", "gone", 1), t("b", "pickup", 2)], services, "b")).toBe(3);
  });

  test("follows the room's minutes", () => {
    const { store, id } = open();
    const mine = store.take(id, "repair");
    const q = () => store.get(id)!;
    expect(estimateWait(q().tickets, q().services, mine.id)).toBe(12);
    store.updateService(id, { id: "pickup", minutes: 10 });
    expect(estimateWait(q().tickets, q().services, mine.id)).toBe(19);
  });

  test("waitMinutes still gives 3 minutes per person ahead", () => {
    expect(waitMinutes(4)).toBe(12);
  });
});

describe("counters", () => {
  test("counters 3 and 4 call and recall once the room has them", () => {
    const { store, id } = open();
    expect(() => store.call(id, 3)).toThrow(new QueueError("counter_closed"));
    expect(store.recall(id, 3)).toBeNull();
    store.setCounters(id, [counter(1), counter(2), counter(3), counter(4)]);
    expect(store.call(id, 3)).toEqual({ done: null, called: expect.objectContaining({ number: "P-007", counter: 3 }) });
    expect(store.call(id, 4).called).toMatchObject({ number: "R-013", counter: 4 });
    expect(store.recall(id, 4)).toMatchObject({ number: "R-013", counter: 4 });
    expect(store.call(id, 3)).toMatchObject({ done: { number: "P-007", status: "done", counter: 3 }, called: { number: "C-004", counter: 3 } });
  });

  test("a closed counter can't call", () => {
    const { store, id } = open();
    store.setCounters(id, [counter(1), counter(2, false)]);
    expect(() => store.call(id, 2)).toThrow(new QueueError("counter_closed"));
    expect(() => store.call(id, 2, { topUp: true })).toThrow(new QueueError("counter_closed"));
    expect(store.call(id, 1).called).not.toBeNull();
    expect(waiting(store, id)).toHaveLength(3);
  });

  test("closing a counter that is serving someone finishes that ticket as done, and says so", () => {
    const { c, store, id } = open();
    const fn = vi.fn();
    store.subscribe(id, fn);
    c.tick(1000);
    store.setCounters(id, [counter(1), counter(2, false)]);
    const seeded = store.get(id)!.tickets.find((t) => t.number === "R-011")!;
    expect(seeded).toMatchObject({ status: "done", counter: 2, at: { done: c.now() } });
    expect(store.recall(id, 2)).toBeNull();
    expect(fn.mock.calls.map(([e]) => e.type)).toEqual(["ticket", "config"]);
    expect(fn.mock.calls[0][0].ticket).toEqual(seeded);
    // Counter 1 is untouched.
    expect(store.get(id)!.tickets.find((t) => t.number === "R-012")).toMatchObject({ status: "called", counter: 1 });
  });

  test("dropping from 4 counters to 2 finishes what counters 3 and 4 were serving", () => {
    const { store, id } = open();
    store.setCounters(id, [counter(1), counter(2), counter(3), counter(4)]);
    store.call(id, 3);
    store.call(id, 4);
    store.setCounters(id, [counter(1), counter(2)]);
    const q = store.get(id)!;
    expect(q.counters.map((x) => x.id)).toEqual([1, 2]);
    expect(q.tickets.filter((t) => t.status === "called").map((t) => t.counter).sort()).toEqual([1, 2]);
    expect(q.tickets.filter((t) => t.counter === 3 || t.counter === 4).map((t) => t.status)).toEqual(["done", "done"]);
  });

  test("counters are renamed, numbered by position, and a missing name is the default", () => {
    const { store, id } = open();
    const set = store.setCounters(id, [{ name: { en: " Window A ", km: "បង្អួច A" }, open: true }, { open: false }, { name: { en: "Window C", km: "បង្អួច C" }, open: true }]);
    expect(set).toEqual([
      { id: 1, name: { en: "Window A", km: "បង្អួច A" }, open: true },
      { id: 2, name: { en: "Counter 2", km: "បញ្ជរ 2" }, open: false },
      { id: 3, name: { en: "Window C", km: "បង្អួច C" }, open: true },
    ]);
    expect(store.get(id)!.counters).toEqual(set);
  });

  test.each([
    ["no counters", [], "counters"],
    ["5 counters", [1, 2, 3, 4, 5].map((n) => counter(n)), "counters"],
    ["not a list", { 1: counter(1) }, "counters"],
    ["open missing", [{ name: { en: "A", km: "A" } }], "open"],
    ["open as text", [{ open: "yes" }], "open"],
    ["empty name", [{ name: { en: "", km: "x" }, open: true }], "name"],
    ["21-char name", [{ name: { en: "x".repeat(21), km: "x" }, open: true }], "name"],
  ])("counters with %s are invalid", (_name, input, field) => {
    const { store, id } = open();
    expect(() => store.setCounters(id, input)).toThrow(new AdminError(field));
    expect(store.get(id)!.counters).toEqual(defaultConfig().counters);
  });
});

describe("settings, reset and events", () => {
  test("settings take a shop name and an auto-call of off, 20 s or 60 s", () => {
    const { store, id } = open();
    expect(store.setSettings(id, { name: "  Dara Mobile ", autoCall: 60, extra: 1 })).toEqual({ name: "Dara Mobile", autoCall: 60 });
    expect(store.setSettings(id, { name: "Dara Mobile", autoCall: 0 })).toEqual({ name: "Dara Mobile", autoCall: 0 });
    for (const bad of [{ name: "", autoCall: 20 }, { name: "x".repeat(41), autoCall: 20 }, { name: "x", autoCall: 30 }, { name: "x", autoCall: "20" }, { name: "x" }]) {
      expect(() => store.setSettings(id, bad)).toThrow(AdminError);
    }
    expect(store.get(id)!.settings).toEqual({ name: "Dara Mobile", autoCall: 0 });
  });

  test("every admin change sends the whole config, never the PIN", () => {
    const { store, id } = open();
    const fn = vi.fn();
    store.subscribe(id, fn);
    const config = () => {
      const q = store.get(id)!;
      return { type: "config", services: q.services, counters: q.counters, settings: q.settings };
    };
    store.updateService(id, { id: "repair", minutes: 7 });
    expect(fn).toHaveBeenLastCalledWith(config());
    expect(fn.mock.lastCall![0].services[0].minutes).toBe(7);
    store.addService(id, { name: { en: "x", km: "x" }, prefix: "X" });
    expect(fn).toHaveBeenLastCalledWith(config());
    store.setCounters(id, [counter(1), counter(2), counter(3)]);
    expect(fn).toHaveBeenLastCalledWith(config());
    store.setSettings(id, { name: "Dara", autoCall: 60 });
    expect(fn).toHaveBeenLastCalledWith(config());
    store.reset(id);
    expect(fn).toHaveBeenLastCalledWith({ type: "config", ...defaultConfig() });
    expect(JSON.stringify(fn.mock.calls)).not.toContain(`"pin"`);
  });

  test("an event's config is not changed by later edits", () => {
    const { store, id } = open();
    const fn = vi.fn();
    store.subscribe(id, fn);
    store.updateService(id, { id: "repair", minutes: 7 });
    const sent = structuredClone(fn.mock.lastCall![0]);
    store.updateService(id, { id: "repair", minutes: 9 });
    store.setCounters(id, [counter(1, false)]);
    expect(fn.mock.calls[0][0]).toEqual(sent);
  });

  test("reset restores the default config and keeps the tickets and the PIN; extra counters' tickets are finished", () => {
    const { store, id } = open();
    const pin = store.get(id)!.pin;
    store.updateService(id, { id: "repair", prefix: "X", hidden: true });
    store.setCounters(id, [counter(1), counter(2), counter(3)]);
    store.call(id, 3);
    store.setSettings(id, { name: "Dara", autoCall: 0 });
    const tickets = store.get(id)!.tickets.length;
    store.reset(id);
    const q = store.get(id)!;
    expect({ services: q.services, counters: q.counters, settings: q.settings }).toEqual(defaultConfig());
    expect(q.tickets).toHaveLength(tickets);
    expect(q.tickets.find((t) => t.counter === 3)).toMatchObject({ status: "done" });
    expect(q.pin).toBe(pin);
    expect(store.take(id, "repair").number).toBe("R-015");
  });

  test("admin changes keep the room alive", () => {
    const { c, store, id } = open();
    c.tick(90 * 60 * 1000);
    store.setSettings(id, { name: "Dara", autoCall: 20 });
    c.tick(90 * 60 * 1000);
    store.sweep();
    expect(store.get(id)).toBeDefined();
  });
});

describe("PIN login", () => {
  test("the right PIN is ok; 5 wrong PINs in 10 minutes lock the room's login until they age out", () => {
    const { c, store, id } = open();
    const pin = store.get(id)!.pin;
    const wrong = pin === "0000" ? "1111" : "0000";
    expect(store.login(id, pin)).toBe("ok");
    for (let i = 0; i < 5; i++) expect(store.login(id, wrong)).toBe("wrong");
    expect(store.login(id, wrong)).toBe("locked");
    expect(store.login(id, pin)).toBe("locked");
    c.tick(10 * 60 * 1000 + 1);
    expect(store.login(id, pin)).toBe("ok");
    expect(store.login(id, Number(pin))).toBe("wrong");
    expect(() => store.login("nope", pin)).toThrow(new QueueError("not_found"));
  });

  test("wrong PINs in one room don't lock another", () => {
    const { store, id } = open();
    const other = store.create().id;
    for (let i = 0; i < 6; i++) store.login(id, "x");
    expect(store.login(other, store.get(other)!.pin)).toBe("ok");
  });
});

describe("queueStats", () => {
  const t = (number: string, status: Ticket["status"], at: Ticket["at"]): Ticket => ({ id: number, room: "q", number, service: "repair", status, at });
  const NOW = pp(15);
  const tickets: Ticket[] = [
    // Yesterday (Phnom Penh): left out, although it is less than 24 hours ago.
    t("R-001", "done", { waiting: pp(23, 50, 27), called: pp(23, 58, 27), done: pp(23, 59, 27) }),
    // 00:10 Phnom Penh is still the day before in UTC: counted.
    t("R-002", "done", { waiting: pp(0, 10), called: pp(0, 14), done: pp(0, 20) }),
    t("R-003", "done", { waiting: pp(9, 0), called: pp(9, 12), done: pp(9, 20) }),
    t("R-004", "called", { waiting: pp(14, 0), called: pp(14, 7) }),
    t("R-005", "left", { waiting: pp(14, 10), left: pp(14, 15) }),
    t("R-006", "left", { waiting: pp(14, 20), called: pp(14, 21), left: pp(14, 22) }),
    t("R-007", "waiting", { waiting: pp(14, 50) }),
  ];

  test("counts today's served and left tickets, with the average and longest wait in minutes", () => {
    expect(queueStats(tickets, NOW)).toEqual({ day: "2026-10-28", served: 2, left: 2, avgWait: 6, longestWait: 12 });
  });

  test("an empty day has no waits", () => {
    expect(queueStats(tickets.slice(0, 1), NOW)).toEqual({ day: "2026-10-28", served: 0, left: 0, avgWait: null, longestWait: null });
    expect(queueStats([], NOW)).toEqual({ day: "2026-10-28", served: 0, left: 0, avgWait: null, longestWait: null });
  });

  test("average wait is rounded to the nearest minute", () => {
    const two = [t("A", "done", { waiting: pp(9, 0), called: pp(9, 1) }), t("B", "done", { waiting: pp(9, 0), called: pp(9, 2) })];
    expect(queueStats(two, NOW)).toMatchObject({ avgWait: 2, longestWait: 2 });
  });
});

describe("ticketsCsv", () => {
  const services = defaultConfig().services.map((s) => (s.id === "pickup" ? { ...s, name: { en: 'Pick up, "fast"', km: "មកយក" } } : s));
  const tickets: Ticket[] = [
    { id: "b", room: "q", number: "P-002", service: "pickup", status: "waiting", at: { waiting: pp(9, 30) } },
    { id: "a", room: "q", number: "R-001", service: "repair", status: "done", counter: 2, at: { waiting: pp(9, 5), called: pp(9, 16), done: pp(9, 30) } },
    { id: "c", room: "q", number: "Z-001", service: "gone", status: "left", at: { waiting: pp(9, 40), left: pp(9, 41) } },
  ];

  test("starts with a BOM and a header, Phnom Penh times, CRLF lines, in take order", () => {
    const csv = ticketsCsv(tickets, services, "en");
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).split("\r\n");
    expect(rows[0]).toBe("date,number,service,taken at,called at,counter,wait (min),status");
    expect(rows[1]).toBe("2026-10-28,R-001,Repair,09:05,09:16,2,11,done");
    expect(rows[2]).toBe('2026-10-28,P-002,"Pick up, ""fast""",09:30,,,,waiting');
    expect(rows[3]).toBe("2026-10-28,Z-001,gone,09:40,,,,left");
    expect(rows).toHaveLength(4);
  });

  test("writes service names in Khmer with lang km", () => {
    expect(ticketsCsv(tickets, services, "km").split("\r\n")[1]).toBe("2026-10-28,R-001,ជួសជុល,09:05,09:16,2,11,done");
  });
});
