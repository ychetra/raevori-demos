import { describe, expect, test, vi } from "vitest";
import { createMemoryStore, QueueError, position, waitMinutes } from "@/features/queue/store";
import type { Ticket } from "@/features/queue/types";

const clock = (start = 10_000_000) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
const brief = (t: Ticket) => `${t.number} ${t.status}${t.counter ? ` @${t.counter}` : ""}`;

describe("queue store", () => {
  test("a new room has an unguessable id, 4 waiting tickets and both counters serving", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const q = store.create();
    expect(q.id.length).toBeGreaterThanOrEqual(16);
    expect(store.create().id).not.toBe(q.id);
    expect(q.tickets.map(brief)).toEqual(["R-011 called @2", "R-012 called @1", "P-007 waiting", "R-013 waiting", "C-004 waiting", "R-014 waiting"]);
    for (const t of q.tickets) {
      expect(t.room).toBe(q.id);
      expect(t.at.waiting).toBeLessThan(c.now());
    }
    expect(q.tickets.filter((t) => t.status === "called").every((t) => t.at.called! > t.at.waiting!)).toBe(true);
  });

  test("ticket ids are unguessable and unique", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const ids = [...store.get(id)!.tickets.map((t) => t.id), store.take(id, "repair").id, store.take(id, "repair").id];
    expect(new Set(ids).size).toBe(ids.length);
    for (const tid of ids) expect(tid).toMatch(/^[A-Za-z0-9_-]{12,}$/);
  });

  test("numbers are sequential per room and per prefix, zero-padded to 3 digits", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    const take = (s: Ticket["service"]) => { c.tick(1000); return store.take(id, s); };
    expect([take("repair"), take("pickup"), take("payment"), take("repair"), take("payment")].map((t) => t.number)).toEqual(["R-015", "P-008", "C-005", "R-016", "C-006"]);
    // Another room counts on its own.
    expect(store.take(store.create().id, "repair").number).toBe("R-015");
  });

  test("a taken ticket starts waiting, stamped with the take time", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    const t = store.take(id, "pickup");
    expect(t).toMatchObject({ room: id, service: "pickup", status: "waiting", at: { waiting: c.now() } });
    expect(t.counter).toBeUndefined();
    expect(store.get(id)!.tickets.at(-1)).toEqual(t);
  });

  test("taking from an unknown room throws not_found", () => {
    const store = createMemoryStore();
    expect(() => store.take("nope", "repair")).toThrow(new QueueError("not_found"));
    expect(() => store.call("nope", 1)).toThrow(new QueueError("not_found"));
    expect(() => store.recall("nope", 1)).toThrow(new QueueError("not_found"));
    expect(() => store.leave("nope", "x")).toThrow(new QueueError("not_found"));
  });

  test("a room hands out 60 visitor tickets and refuses the 61st", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    for (let i = 0; i < 60; i++) store.take(id, "repair");
    expect(() => store.take(id, "payment")).toThrow(new QueueError("full"));
    expect(store.get(id)!.tickets).toHaveLength(66);
  });

  test("call finishes the counter's ticket and calls the oldest waiting ticket, across services", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    c.tick(1000);
    const r = store.call(id, 1);
    expect(r.done).toMatchObject({ number: "R-012", status: "done", counter: 1, at: { done: c.now() } });
    expect(r.called).toMatchObject({ number: "P-007", status: "called", counter: 1, at: { called: c.now() } });
    expect(store.call(id, 2)).toMatchObject({ done: { number: "R-011", status: "done" }, called: { number: "R-013", counter: 2 } });
    expect(store.call(id, 1)).toMatchObject({ done: { number: "P-007" }, called: { number: "C-004", counter: 1 } });
    expect(store.get(id)!.tickets.map(brief)).toEqual(["R-011 done @2", "R-012 done @1", "P-007 done @1", "R-013 called @2", "C-004 called @1", "R-014 waiting"]);
  });

  test("a visitor's ticket is called after the seeded ones, in take order", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    c.tick(1000);
    const mine = store.take(id, "payment");
    c.tick(1000);
    const later = store.take(id, "repair");
    const called = [1, 2, 1, 2, 1, 2].map((n) => store.call(id, n as 1 | 2).called?.number);
    expect(called).toEqual(["P-007", "R-013", "C-004", "R-014", mine.number, later.number]);
  });

  describe("auto-call top-up", () => {
    const waiting = (store: ReturnType<typeof createMemoryStore>, id: string) => store.get(id)!.tickets.filter((t) => t.status === "waiting");

    test("topUp keeps 3 people waiting with made-up walk-ins, numbered in sequence and announced", () => {
      const c = clock();
      const store = createMemoryStore({ now: c.now });
      const { id } = store.create();
      const fn = vi.fn();
      store.subscribe(id, fn);
      for (let i = 0; i < 10; i++) {
        c.tick(20_000);
        store.call(id, ((i % 2) + 1) as 1 | 2, { topUp: true });
        expect(waiting(store, id)).toHaveLength(3);
      }
      const tickets = store.get(id)!.tickets;
      // 6 seeded + 9 walk-ins (the first call still left 3 waiting).
      expect(tickets).toHaveLength(15);
      const walkIns = tickets.slice(6);
      for (const t of walkIns) {
        expect(t.room).toBe(id);
        expect(t.number).toMatch(/^[RPC]-\d{3}$/);
      }
      // Every number is unique and each prefix counts up without gaps from the seeded ones.
      for (const p of ["R", "P", "C"]) {
        const nums = tickets.filter((t) => t.number.startsWith(`${p}-`)).map((t) => Number(t.number.slice(2)));
        const first = { R: 11, P: 7, C: 4 }[p]!;
        expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => first + i));
      }
      // Each walk-in is sent to subscribers like any other new ticket.
      for (const t of walkIns) expect(fn).toHaveBeenCalledWith({ type: "ticket", ticket: expect.objectContaining({ id: t.id, status: "waiting" }) });
    });

    test("walk-ins are random services", () => {
      const store = createMemoryStore();
      const { id } = store.create();
      for (let i = 0; i < 60; i++) store.call(id, 1, { topUp: true });
      const services = new Set(store.get(id)!.tickets.slice(6).map((t) => t.service));
      expect(services.size).toBeGreaterThan(1);
    });

    test("walk-ins queue behind a visitor who is already waiting, so the visitor moves forward and is called", () => {
      const c = clock();
      const store = createMemoryStore({ now: c.now });
      const { id } = store.create();
      c.tick(1000);
      const mine = store.take(id, "payment");
      const ahead = () => store.get(id)!.tickets.filter((t) => t.status === "waiting" && t.id !== mine.id && t.at.waiting! <= mine.at.waiting!).length;
      expect(ahead()).toBe(4);
      const called: string[] = [];
      for (let i = 0; i < 5; i++) {
        c.tick(20_000);
        called.push(store.call(id, ((i % 2) + 1) as 1 | 2, { topUp: true }).called!.number);
        expect(ahead()).toBe(Math.max(0, 3 - i));
      }
      expect(called).toEqual(["P-007", "R-013", "C-004", "R-014", mine.number]);
      expect(waiting(store, id)).toHaveLength(3);
    });

    test("walk-ins don't count against the 60 visitor tickets", () => {
      const store = createMemoryStore();
      const { id } = store.create();
      for (let i = 0; i < 20; i++) store.call(id, 1, { topUp: true });
      for (let i = 0; i < 60; i++) store.take(id, "repair");
      expect(() => store.take(id, "repair")).toThrow(new QueueError("full"));
    });

    test("top-ups stop once the room holds 400 tickets, and the line then empties", () => {
      const store = createMemoryStore();
      const { id } = store.create();
      for (let i = 0; i < 60; i++) store.take(id, "repair");
      for (let i = 0; i < 600; i++) {
        store.call(id, ((i % 2) + 1) as 1 | 2, { topUp: true });
        expect(store.get(id)!.tickets.length).toBeLessThanOrEqual(400);
      }
      expect(store.get(id)!.tickets).toHaveLength(400);
      expect(waiting(store, id)).toHaveLength(0);
    });

    test("without topUp the line still empties and no walk-ins appear", () => {
      const store = createMemoryStore();
      const { id } = store.create();
      for (let i = 0; i < 6; i++) store.call(id, 1, { topUp: false });
      expect(waiting(store, id)).toHaveLength(0);
      expect(store.get(id)!.tickets).toHaveLength(6);
    });
  });

  test("call with no one waiting finishes the counter's ticket and leaves it idle", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    for (let i = 0; i < 4; i++) store.call(id, 1);
    const before = store.get(id)!.tickets.map(brief);
    expect(before.filter((s) => s.includes("waiting"))).toEqual([]);
    const fn = vi.fn();
    store.subscribe(id, fn);
    const r = store.call(id, 1);
    expect(r).toEqual({ done: expect.objectContaining({ number: "R-014", status: "done" }), called: null });
    expect(fn).toHaveBeenCalledTimes(1);
    // Idle counter, empty queue: nothing changes and nothing is sent.
    expect(store.call(id, 1)).toEqual({ done: null, called: null });
    expect(fn).toHaveBeenCalledTimes(1);
    // Counter 2 is still serving its seeded ticket.
    expect(store.get(id)!.tickets.find((t) => t.number === "R-011")).toMatchObject({ status: "called", counter: 2 });
  });

  test("an idle counter picks up a ticket taken later", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    for (let i = 0; i < 6; i++) store.call(id, 1);
    expect(store.call(id, 1).called).toBeNull();
    const t = store.take(id, "repair");
    expect(store.call(id, 1)).toEqual({ done: null, called: expect.objectContaining({ id: t.id, status: "called", counter: 1 }) });
  });

  test("recall re-sends the counter's current ticket with a fresh called time", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    const fn = vi.fn();
    store.subscribe(id, fn);
    c.tick(5000);
    const t = store.recall(id, 2)!;
    expect(t).toMatchObject({ number: "R-011", status: "called", counter: 2, at: { called: c.now() } });
    expect(fn).toHaveBeenCalledWith({ type: "ticket", ticket: t });
    expect(store.get(id)!.tickets.find((x) => x.id === t.id)).toEqual(t);
  });

  test("recall on an idle counter returns null and sends nothing", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    for (let i = 0; i < 5; i++) store.call(id, 1);
    const fn = vi.fn();
    store.subscribe(id, fn);
    expect(store.recall(id, 1)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  test("leave takes a waiting ticket out of the line", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    const t = store.take(id, "repair");
    c.tick(1000);
    expect(store.leave(id, t.id)).toMatchObject({ id: t.id, status: "left", at: { waiting: c.now() - 1000, left: c.now() } });
    for (let i = 0; i < 4; i++) store.call(id, 1);
    expect(store.call(id, 1).called).toBeNull();
  });

  test("leaving a called ticket frees its counter for the next call", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const seeded = store.get(id)!.tickets.find((t) => t.number === "R-012")!;
    expect(store.leave(id, seeded.id)).toMatchObject({ status: "left", counter: 1 });
    expect(store.recall(id, 1)).toBeNull();
    expect(store.call(id, 1)).toEqual({ done: null, called: expect.objectContaining({ number: "P-007" }) });
  });

  test("leaving a done or left ticket changes nothing and sends nothing", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const done = store.call(id, 1).done!;
    const t = store.take(id, "pickup");
    const left = store.leave(id, t.id);
    const fn = vi.fn();
    store.subscribe(id, fn);
    expect(store.leave(id, done.id)).toEqual(done);
    expect(store.leave(id, t.id)).toEqual(left);
    expect(fn).not.toHaveBeenCalled();
  });

  test("leaving an unknown ticket throws not_found", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    expect(() => store.leave(id, "nope")).toThrow(new QueueError("not_found"));
  });

  test("subscribers hear about every changed ticket, and can unsubscribe", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const fn = vi.fn();
    const off = store.subscribe(id, fn);
    const t = store.take(id, "repair");
    const r = store.call(id, 1);
    store.leave(id, t.id);
    expect(fn.mock.calls.map(([e]) => [e.type, e.ticket.number, e.ticket.status])).toEqual([
      ["ticket", t.number, "waiting"],
      ["ticket", r.done!.number, "done"],
      ["ticket", r.called!.number, "called"],
      ["ticket", t.number, "left"],
    ]);
    off();
    store.take(id, "repair");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  test("a listener that throws is dropped and does not break the ticket or other listeners", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const broken = vi.fn(() => { throw new Error("Invalid state: Controller is already closed"); });
    const fn = vi.fn();
    store.subscribe(id, broken);
    store.subscribe(id, fn);
    const t = store.take(id, "repair");
    expect(t.status).toBe("waiting");
    expect(store.get(id)!.tickets.some((x) => x.id === t.id)).toBe(true);
    expect(fn).toHaveBeenCalledWith({ type: "ticket", ticket: t });
    expect(broken).toHaveBeenCalledTimes(1);
    expect(store.call(id, 1).called).not.toBeNull();
    expect(broken).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("sweep removes rooms idle for more than 2 hours", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    c.tick(2 * 60 * 60 * 1000 - 1);
    store.sweep();
    expect(store.get(id)).toBeDefined();
    c.tick(2);
    store.sweep();
    expect(store.get(id)).toBeUndefined();
    expect(() => store.take(id, "repair")).toThrow(new QueueError("not_found"));
  });

  test("activity keeps a room alive", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    c.tick(90 * 60 * 1000);
    store.call(id, 1);
    c.tick(90 * 60 * 1000);
    store.sweep();
    expect(store.get(id)).toBeDefined();
  });

  test("creating room 501 evicts the least recently touched room", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now, maxRooms: 500 });
    const ids: string[] = [];
    for (let i = 0; i < 500; i++) { ids.push(store.create().id); c.tick(1); }
    store.take(ids[0], "repair"); // touch the oldest, so ids[1] becomes least recent
    c.tick(1);
    store.create();
    expect(store.get(ids[0])).toBeDefined();
    expect(store.get(ids[1])).toBeUndefined();
  });
});

describe("position and wait", () => {
  test("position counts the waiting tickets taken before it", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const mine = store.take(id, "repair");
    const later = store.take(id, "payment");
    const tickets = () => store.get(id)!.tickets;
    expect(position(tickets(), mine.id)).toBe(4);
    expect(position(tickets(), later.id)).toBe(5);
    store.call(id, 1);
    expect(position(tickets(), mine.id)).toBe(3);
    // Someone ahead leaving moves me up; someone behind leaving does not.
    store.leave(id, tickets().find((t) => t.number === "R-014")!.id);
    store.leave(id, later.id);
    expect(position(tickets(), mine.id)).toBe(2);
  });

  test("position follows take time, not array order", () => {
    const t = (id: string, waiting: number, status: Ticket["status"] = "waiting"): Ticket => ({ id, room: "q", number: id, service: "repair", status, at: { waiting } });
    const tickets = [t("c", 30), t("a", 10), t("x", 5, "done"), t("b", 20)];
    expect(position(tickets, "a")).toBe(0);
    expect(position(tickets, "b")).toBe(1);
    expect(position(tickets, "c")).toBe(2);
    expect(position(tickets, "x")).toBe(0);
    expect(position(tickets, "missing")).toBe(0);
  });

  test("a called ticket has no one ahead", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const called = store.call(id, 1).called!;
    expect(position(store.get(id)!.tickets, called.id)).toBe(0);
  });

  test("estimated wait is 3 minutes per person ahead", () => {
    expect(waitMinutes(0)).toBe(0);
    expect(waitMinutes(1)).toBe(3);
    expect(waitMinutes(4)).toBe(12);
  });
});
