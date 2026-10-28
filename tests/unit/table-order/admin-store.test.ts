import { describe, expect, test, vi } from "vitest";
import { AdminError, DEFAULT_SETTINGS, isOpen, MAX_ITEMS, ordersCsv } from "@/features/table-order/admin";
import { MENU } from "@/features/table-order/menu";
import { createMemoryStore, RoomError } from "@/features/table-order/store";
import type { Order } from "@/features/table-order/types";
import { liveSales } from "@/features/shop-pulse/types";
import { kpis } from "@/features/shop-pulse/metrics";
import { PP_OFFSET_MS } from "@/features/shop-pulse/time";

/** Epoch ms of a Phnom Penh wall-clock time. */
const pp = (h: number, min = 0, s = 0) => Date.UTC(2026, 9, 28, h, min, s) - PP_OFFSET_MS;
const NOON = pp(12);
const clock = (start = NOON) => { let t = start; return { now: () => t, set: (ms: number) => { t = ms; }, tick: (ms: number) => { t += ms; } }; };
const latte = [{ itemId: "iced-latte", qty: 1, options: {} }];
const open = () => {
  const c = clock();
  const store = createMemoryStore({ now: c.now });
  return { c, store, id: store.create().id };
};

describe("room menu and settings", () => {
  test("a new room gets a copy of the default menu, the default settings and a random 4-digit PIN", () => {
    const { store, id } = open();
    const room = store.get(id)!;
    expect(room.menu).toEqual(MENU);
    expect(room.menu).not.toBe(MENU);
    expect(room.settings).toEqual({ name: "Lotus Coffee", tables: 12, open: "00:00", close: "24:00" });
    expect(room.settings).toEqual(DEFAULT_SETTINGS);
    expect(room.pin).toMatch(/^\d{4}$/);
    const pins = new Set(Array.from({ length: 20 }, () => store.get(store.create().id)!.pin));
    expect(pins.size).toBeGreaterThan(1);
  });

  test("editing room A's menu touches neither room B nor MENU, and items don't share option groups", () => {
    const { store, id: a } = open();
    const b = store.create().id;
    const before = structuredClone(MENU);
    store.updateItem(a, { id: "iced-latte", price: 3, name: { en: "Big latte", km: "ឡាតេធំ" }, options: { size: { large: 1 } } });
    expect(store.get(a)!.menu.find((m) => m.id === "iced-latte")).toMatchObject({ price: 3, name: { en: "Big latte" } });
    expect(store.get(b)!.menu.find((m) => m.id === "iced-latte")).toMatchObject({ price: 2.25, name: { en: "Iced latte" } });
    expect(MENU).toEqual(before);
    // iced-khmer-coffee shares the `size` group in MENU; the room copy must not.
    const khmer = store.get(a)!.menu.find((m) => m.id === "iced-khmer-coffee")!;
    expect(khmer.options.find((g) => g.id === "size")!.choices.find((c) => c.id === "large")!.delta).toBe(0.5);
  });

  test("sold-out and hidden items are refused with sold_out and the item id", () => {
    const { store, id } = open();
    store.updateItem(id, { id: "iced-latte", soldOut: true });
    expect(() => store.addOrder(id, 4, latte)).toThrow(expect.objectContaining({ code: "sold_out", itemId: "iced-latte" }));
    store.updateItem(id, { id: "iced-latte", soldOut: false, hidden: true });
    expect(() => store.addOrder(id, 4, [{ itemId: "americano", qty: 1, options: {} }, ...latte])).toThrow(expect.objectContaining({ code: "sold_out", itemId: "iced-latte" }));
    store.updateItem(id, { id: "iced-latte", hidden: false });
    expect(store.addOrder(id, 4, latte).status).toBe("new");
  });

  test("a new room takes orders at any hour: demo visitors come from every time zone", () => {
    const { c, store, id } = open();
    for (const h of [0, 3, 6, 21, 23]) {
      c.set(pp(h, 30));
      expect(store.addOrder(id, 4, latte).status).toBe("new");
    }
  });

  test("orders are refused outside opening hours, Phnom Penh time", () => {
    const { c, store, id } = open();
    store.setSettings(id, { name: "Lotus Coffee", tables: 12, open: "07:00", close: "21:00" });
    c.set(pp(6, 59, 59)); // 23:59:59 UTC the day before
    expect(() => store.addOrder(id, 4, latte)).toThrow(new RoomError("closed"));
    c.set(pp(7)); // 00:00 UTC
    expect(store.addOrder(id, 4, latte).status).toBe("new");
    c.set(pp(20, 59, 59));
    expect(store.addOrder(id, 4, latte).status).toBe("new");
    c.set(pp(21));
    expect(() => store.addOrder(id, 4, latte)).toThrow(new RoomError("closed"));
  });

  test("isOpen follows the room's hours, with half hours and a 24:00 close", () => {
    const s = { ...DEFAULT_SETTINGS, open: "06:30", close: "24:00" };
    expect(isOpen(s, pp(6, 29))).toBe(false);
    expect(isOpen(s, pp(6, 30))).toBe(true);
    expect(isOpen(s, pp(23, 59, 59))).toBe(true);
    expect(isOpen(s, pp(0))).toBe(false);
  });

  test("a table above the room's table count is refused", () => {
    const { store, id } = open();
    expect(store.addOrder(id, 12, latte).table).toBe(12);
    expect(() => store.addOrder(id, 13, latte)).toThrow(new RoomError("bad_table"));
    store.setSettings(id, { ...DEFAULT_SETTINGS, tables: 20 });
    expect(store.addOrder(id, 13, latte).table).toBe(13);
  });

  test("a price edit changes the next order's total but not existing orders", () => {
    const { store, id } = open();
    const first = store.addOrder(id, 4, latte);
    store.updateItem(id, { id: "iced-latte", price: 3 });
    expect(store.addOrder(id, 4, latte).total).toBe(3);
    expect(store.get(id)!.orders.find((o) => o.id === first.id)!.total).toBe(2.25);
  });

  test("an expected total that no longer matches is refused with price_changed and the new total", () => {
    const { store, id } = open();
    store.updateItem(id, { id: "iced-latte", price: 3 });
    expect(() => store.addOrder(id, 4, latte, 2.25)).toThrow(expect.objectContaining({ code: "price_changed", total: 3 }));
    expect(store.addOrder(id, 4, latte, 3).total).toBe(3);
  });

  test("new items get server ids, the category's options, and are capped at 60", () => {
    const { store, id } = open();
    const item = store.addItem(id, { name: { en: "Lime soda", km: "សូដាក្រូចឆ្មា" }, price: 1.5, cat: "tea", image: "cup:#a4c639" });
    expect(item.id).not.toBe("");
    expect(item.options.map((g) => g.id)).toEqual(["size", "ice", "sugar"]);
    expect(store.addOrder(id, 4, [{ itemId: item.id, qty: 2, options: {} }]).total).toBe(3);
    const pastry = store.addItem(id, { id: "iced-latte", name: { en: "Muffin", km: "នំម៉ាហ្វីន" }, price: 1.25, cat: "bakery" } as never);
    expect(pastry.id).not.toBe("iced-latte");
    expect(pastry.image).toBe("croissant");
    expect(pastry.options.map((g) => g.id)).toEqual(["warm"]);
    while (store.get(id)!.menu.length < MAX_ITEMS) store.addItem(id, { name: { en: "x", km: "x" }, price: 1, cat: "bakery" });
    expect(MAX_ITEMS).toBe(60);
    expect(() => store.addItem(id, { name: { en: "x", km: "x" }, price: 1, cat: "bakery" })).toThrow(new RoomError("too_many_items"));
  });

  test.each([
    ["empty English name", { id: "iced-latte", name: { en: " ", km: "x" } }, "name"],
    ["41-char name", { id: "iced-latte", name: { en: "x".repeat(41), km: "x" } }, "name"],
    ["121-char note", { id: "iced-latte", note: { en: "x".repeat(121), km: "" } }, "note"],
    ["price 0", { id: "iced-latte", price: 0 }, "price"],
    ["price 100.25", { id: "iced-latte", price: 100.25 }, "price"],
    ["price 1.10", { id: "iced-latte", price: 1.1 }, "price"],
    ["unknown category", { id: "iced-latte", cat: "beer" }, "cat"],
    ["pastry art on a drink", { id: "iced-latte", image: "loaf" }, "image"],
    ["bad colour", { id: "iced-latte", image: "cup:red\"/><script>" }, "image"],
    ["delta 0.1", { id: "iced-latte", options: { size: { large: 0.1 } } }, "options"],
    ["delta 101", { id: "iced-latte", options: { size: { large: 101 } } }, "options"],
    ["unknown group", { id: "iced-latte", options: { warm: { yes: 1 } } }, "options"],
    ["unknown choice", { id: "iced-latte", options: { size: { huge: 1 } } }, "options"],
    ["soldOut not boolean", { id: "iced-latte", soldOut: "yes" }, "soldOut"],
  ])("item edit with %s is invalid", (_name, patch, field) => {
    const { store, id } = open();
    expect(() => store.updateItem(id, patch)).toThrow(new AdminError(field));
    expect(store.get(id)!.menu.find((m) => m.id === "iced-latte")!.price).toBe(2.25);
  });

  test("editing an unknown item is not_found; edits keep fields left out", () => {
    const { store, id } = open();
    expect(() => store.updateItem(id, { id: "nope", price: 1 })).toThrow(new RoomError("not_found"));
    const edited = store.updateItem(id, { id: "iced-khmer-coffee", price: 100, note: { en: "", km: "" } });
    expect(edited).toMatchObject({ price: 100, name: MENU[0].name, cat: "coffee", image: MENU[0].image });
    expect(edited.note).toBeUndefined();
  });

  test.each([
    ["open after close", { open: "21:00", close: "07:00" }],
    ["open equals close", { open: "09:00", close: "09:00" }],
    ["quarter hour", { open: "07:15" }],
    ["bad format", { close: "9pm" }],
    ["0 tables", { tables: 0 }],
    ["51 tables", { tables: 51 }],
    ["empty name", { name: "  " }],
    ["41-char name", { name: "x".repeat(41) }],
  ])("settings with %s are invalid", (_name, change) => {
    const { store, id } = open();
    expect(() => store.setSettings(id, { ...DEFAULT_SETTINGS, ...change })).toThrow(AdminError);
    expect(store.get(id)!.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("settings are trimmed and stored", () => {
    const { store, id } = open();
    expect(store.setSettings(id, { name: "  Pepper Café ", tables: 50, open: "00:00", close: "24:00", extra: 1 } as never)).toEqual({ name: "Pepper Café", tables: 50, open: "00:00", close: "24:00" });
    expect(store.get(id)!.settings.name).toBe("Pepper Café");
  });

  test("reset restores the default menu and settings, and keeps orders and the PIN", () => {
    const { store, id } = open();
    const pin = store.get(id)!.pin;
    store.addOrder(id, 4, latte);
    store.updateItem(id, { id: "iced-latte", price: 9, soldOut: true });
    store.addItem(id, { name: { en: "x", km: "x" }, price: 1, cat: "bakery" });
    store.setSettings(id, { ...DEFAULT_SETTINGS, name: "Other" });
    const orders = store.get(id)!.orders.length;
    store.reset(id);
    const room = store.get(id)!;
    expect(room.menu).toEqual(MENU);
    expect(room.settings).toEqual(DEFAULT_SETTINGS);
    expect(room.orders).toHaveLength(orders);
    expect(room.pin).toBe(pin);
  });
});

describe("done and cancelled", () => {
  test("done is allowed from new, preparing and ready", () => {
    const { store, id } = open();
    for (const steps of [0, 1, 2]) {
      const o = store.addOrder(id, 4, latte);
      for (let i = 0; i < steps; i++) store.advance(id, o.id);
      const done = store.setOrderStatus(id, o.id, "done");
      expect(done.status).toBe("done");
      expect(done.at.done).toBeTypeOf("number");
    }
  });

  test("cancel needs a reason of at most 120 characters and keeps it on the order", () => {
    const { store, id } = open();
    const o = store.addOrder(id, 4, latte);
    expect(() => store.setOrderStatus(id, o.id, "cancelled")).toThrow(new AdminError("reason"));
    expect(() => store.setOrderStatus(id, o.id, "cancelled", "x".repeat(121))).toThrow(new AdminError("reason"));
    const c = store.setOrderStatus(id, o.id, "cancelled", "  Out of milk ");
    expect(c).toMatchObject({ status: "cancelled", cancelReason: "Out of milk" });
    expect(c.at.cancelled).toBeTypeOf("number");
  });

  test("done and cancelled orders can't change again, and advance leaves them alone", () => {
    const { store, id } = open();
    const fn = vi.fn();
    const a = store.addOrder(id, 4, latte);
    const b = store.addOrder(id, 4, latte);
    store.setOrderStatus(id, a.id, "done");
    store.setOrderStatus(id, b.id, "cancelled", "Customer left");
    store.subscribe(id, fn);
    expect(store.advance(id, a.id).status).toBe("done");
    expect(store.advance(id, b.id).status).toBe("cancelled");
    expect(fn).not.toHaveBeenCalled();
    expect(() => store.setOrderStatus(id, a.id, "cancelled", "late")).toThrow(new RoomError("bad_status"));
    expect(() => store.setOrderStatus(id, b.id, "done")).toThrow(new RoomError("bad_status"));
    expect(() => store.setOrderStatus(id, "Z9", "done")).toThrow(new RoomError("not_found"));
    expect(() => store.setOrderStatus(id, a.id, "ready" as never)).toThrow(AdminError);
  });

  test("Shop Pulse leaves cancelled live orders out", () => {
    const { store, id } = open();
    const kept = store.addOrder(id, 4, latte);
    const gone = store.addOrder(id, 4, [{ itemId: "americano", qty: 2, options: {} }]);
    store.setOrderStatus(id, gone.id, "cancelled", "Wrong table");
    store.setOrderStatus(id, kept.id, "done");
    const sales = liveSales(store.get(id)!.orders);
    expect(sales.map((s) => s.id)).toContain(kept.id);
    expect(sales.map((s) => s.id)).not.toContain(gone.id);
    expect(kpis(sales.filter((s) => s.id === kept.id || s.id === gone.id), NOON + 1).today).toEqual({ revenue: 2.25, orders: 1, avg: 2.25 });
  });
});

describe("events", () => {
  test("menu, settings, done and cancel changes are broadcast", () => {
    const { store, id } = open();
    const o = store.addOrder(id, 4, latte);
    const p = store.addOrder(id, 4, latte);
    const fn = vi.fn();
    store.subscribe(id, fn);
    store.updateItem(id, { id: "iced-latte", soldOut: true });
    expect(fn).toHaveBeenLastCalledWith({ type: "menu", menu: store.get(id)!.menu });
    expect(fn.mock.lastCall![0].menu.find((m: { id: string }) => m.id === "iced-latte").soldOut).toBe(true);
    store.addItem(id, { name: { en: "x", km: "x" }, price: 1, cat: "bakery" });
    expect(fn.mock.lastCall![0].type).toBe("menu");
    store.setSettings(id, { ...DEFAULT_SETTINGS, name: "Pepper" });
    expect(fn).toHaveBeenLastCalledWith({ type: "settings", settings: { ...DEFAULT_SETTINGS, name: "Pepper" } });
    store.setOrderStatus(id, o.id, "done");
    expect(fn).toHaveBeenLastCalledWith({ type: "order", order: expect.objectContaining({ id: o.id, status: "done" }) });
    store.setOrderStatus(id, p.id, "cancelled", "No milk");
    expect(fn).toHaveBeenLastCalledWith({ type: "order", order: expect.objectContaining({ id: p.id, status: "cancelled", cancelReason: "No milk" }) });
    fn.mockClear();
    store.reset(id);
    expect(fn.mock.calls.map((c) => c[0].type)).toEqual(["menu", "settings"]);
    expect(JSON.stringify(fn.mock.calls)).not.toContain(`"pin"`);
  });

  test("admin changes keep the room alive", () => {
    const { c, store, id } = open();
    c.tick(90 * 60 * 1000);
    store.updateItem(id, { id: "iced-latte", soldOut: true });
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
    expect(() => store.login("nope", pin)).toThrow(new RoomError("not_found"));
  });

  test("wrong PINs in one room don't lock another", () => {
    const { store, id } = open();
    const other = store.create().id;
    for (let i = 0; i < 6; i++) store.login(id, "x");
    expect(store.login(other, store.get(other)!.pin)).toBe("ok");
  });
});

describe("ordersCsv", () => {
  const order = (over: Partial<Order>): Order => ({
    id: "A10", room: "r", table: 4, total: 2.25, payment: "khqr", status: "new", at: { new: pp(9, 5) },
    lines: [{ itemId: "iced-latte", qty: 1, options: { size: "large", ice: "less", sugar: "100" }, name: { en: "Iced latte", km: "ឡាតេទឹកកក" }, unitPrice: 2.75 }],
    ...over,
  });

  test("starts with a BOM and a header, uses Phnom Penh time, CRLF lines, oldest first", () => {
    const csv = ordersCsv([order({ id: "A11", at: { new: pp(10, 30) }, status: "cancelled" }), order({})], "en");
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).split("\r\n");
    expect(rows[0]).toBe("date,time,order no.,table,items,total USD,total KHR,payment,status");
    expect(rows[1]).toBe("2026-10-28,09:05,A10,4,1× Iced latte (Large · Less ice),2.25,9225,KHQR,new");
    expect(rows[2]).toMatch(/^2026-10-28,10:30,A11,.*,cancelled$/);
  });

  test("escapes commas and quotes, joins lines with a semicolon, and writes Khmer names with lang km", () => {
    const cake = { itemId: "x", qty: 2, options: {}, name: { en: 'Cake, "big"', km: "នំ" }, unitPrice: 1 };
    const row = ordersCsv([order({ lines: [cake, { ...cake, qty: 1, name: { en: "Tea", km: "តែ" } }] })], "en").split("\r\n")[1];
    expect(row).toBe('2026-10-28,09:05,A10,4,"2× Cake, ""big""; 1× Tea",2.25,9225,KHQR,new');
    expect(ordersCsv([order({})], "km")).toContain("1× ឡាតេទឹកកក (ធំ · ទឹកកកតិច)");
  });
});
