import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createMemoryStore, RoomError } from "@/features/table-order/store";

// Rooms refuse orders outside opening hours (07:00-21:00 Phnom Penh): pin Date to 12:00 Phnom Penh so these run at any hour.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 28, 5));
});
afterAll(() => vi.useRealTimers());

const latte = [{ itemId: "iced-latte", qty: 1, options: {} }];
const clock = (start = 1_000_000) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };

describe("room store", () => {
  test("a new room has an unguessable id and two seeded tickets", () => {
    const store = createMemoryStore();
    const room = store.create();
    expect(room.id.length).toBeGreaterThanOrEqual(16);
    expect(room.orders.map((o) => o.table).sort()).toEqual([2, 7]);
    expect(store.create().id).not.toBe(room.id);
  });

  test("adding to an unknown room throws not_found", () => {
    const store = createMemoryStore();
    expect(() => store.addOrder("nope", 4, latte)).toThrow(new RoomError("not_found"));
  });

  test("a room accepts 30 visitor orders and refuses the 31st", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    for (let i = 0; i < 30; i++) store.addOrder(id, 4, latte);
    expect(() => store.addOrder(id, 4, latte)).toThrow(new RoomError("full"));
  });

  test("new orders are priced by the server and start as new", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const order = store.addOrder(id, 4, [{ itemId: "iced-latte", qty: 2, options: { size: "large" } }]);
    expect(order).toMatchObject({ room: id, table: 4, total: 5.5, payment: "khqr", status: "new" });
    expect(store.get(id)!.orders.some((o) => o.id === order.id)).toBe(true);
  });

  test("advance moves new → preparing → ready and stays ready", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const o = store.addOrder(id, 4, latte);
    expect(store.advance(id, o.id).status).toBe("preparing");
    expect(store.advance(id, o.id).status).toBe("ready");
    expect(store.advance(id, o.id).status).toBe("ready");
    expect(store.get(id)!.orders.find((x) => x.id === o.id)!.at.ready).toBeTypeOf("number");
  });

  test("subscribers hear about new and advanced orders, and can unsubscribe", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const fn = vi.fn();
    const off = store.subscribe(id, fn);
    const o = store.addOrder(id, 4, latte);
    store.advance(id, o.id);
    expect(fn).toHaveBeenNthCalledWith(1, { type: "order", order: expect.objectContaining({ id: o.id, status: "new" }) });
    expect(fn).toHaveBeenNthCalledWith(2, { type: "order", order: expect.objectContaining({ id: o.id, status: "preparing" }) });
    off();
    store.addOrder(id, 4, latte);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a listener that throws is dropped and does not break the order or other listeners", () => {
    const store = createMemoryStore();
    const { id } = store.create();
    const broken = vi.fn(() => { throw new Error("Invalid state: Controller is already closed"); });
    const fn = vi.fn();
    store.subscribe(id, broken);
    store.subscribe(id, fn);
    const o = store.addOrder(id, 4, latte);
    expect(o).toMatchObject({ table: 4, status: "new" });
    expect(store.get(id)!.orders.some((x) => x.id === o.id)).toBe(true);
    expect(fn).toHaveBeenCalledWith({ type: "order", order: expect.objectContaining({ id: o.id }) });
    expect(broken).toHaveBeenCalledTimes(1);
    expect(store.advance(id, o.id).status).toBe("preparing");
    expect(broken).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
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
  });

  test("activity keeps a room alive", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    const { id } = store.create();
    c.tick(90 * 60 * 1000);
    store.addOrder(id, 4, latte);
    c.tick(90 * 60 * 1000);
    store.sweep();
    expect(store.get(id)).toBeDefined();
  });

  test("creating room 501 evicts the least recently touched room", () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now, maxRooms: 500 });
    const ids: string[] = [];
    for (let i = 0; i < 500; i++) { ids.push(store.create().id); c.tick(1); }
    store.addOrder(ids[0], 4, latte); // touch the oldest, so ids[1] becomes least recent
    c.tick(1);
    store.create();
    expect(store.get(ids[0])).toBeDefined();
    expect(store.get(ids[1])).toBeUndefined();
  });
});
