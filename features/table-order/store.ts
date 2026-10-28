import { randomBytes, randomInt } from "node:crypto";
import { AdminError, DEFAULT_SETTINGS, editItem, isOpen, MAX_ITEMS, newItem, parseReason, parseSettings } from "./admin";
import { copyMenu } from "./menu";
import { priceOrder } from "./pricing";
import type { CartLine, MenuItem, Order, Room, RoomEvent, ShopSettings } from "./types";

type Code = "not_found" | "full" | "sold_out" | "closed" | "bad_table" | "bad_status" | "price_changed" | "too_many_items";

/** A refused room operation. `itemId` comes with sold_out, `total` (the server's new total) with price_changed. */
export class RoomError extends Error {
  readonly itemId?: string;
  readonly total?: number;
  constructor(readonly code: Code, extra: { itemId?: string; total?: number } = {}) {
    super(code);
    Object.assign(this, extra);
  }
}

export type LoginResult = "ok" | "wrong" | "locked";

export interface RoomStore {
  create(): Room;
  get(id: string): Room | undefined;
  /** `expectedTotal`, when given, is the total the phone showed; a different server total refuses the order with price_changed. */
  addOrder(id: string, table: number, lines: CartLine[], expectedTotal?: number): Order;
  advance(id: string, orderId: string): Order;
  setOrderStatus(id: string, orderId: string, status: "done" | "cancelled", reason?: unknown): Order;
  updateItem(id: string, patch: unknown): MenuItem;
  addItem(id: string, input: unknown): MenuItem;
  setSettings(id: string, input: unknown): ShopSettings;
  reset(id: string): Room;
  login(id: string, pin: unknown): LoginResult;
  subscribe(id: string, fn: (e: RoomEvent) => void): () => void;
  sweep(): void;
}

type Entry = Room & { added: number; seq: number; itemSeq: number; pinFails: number[]; listeners: Set<(e: RoomEvent) => void> };

// The kitchen's button: done and cancelled orders are the admin's, and the kitchen leaves them alone.
const NEXT: Record<Order["status"], Order["status"]> = { new: "preparing", preparing: "ready", ready: "ready", done: "done", cancelled: "cancelled" };
const OPEN: Order["status"][] = ["new", "preparing", "ready"];

const PIN_TRIES = 5;
const PIN_WINDOW_MS = 10 * 60 * 1000;

/** Rooms live in memory: one per visitor session, private, dropped after `ttlMs` without activity. */
// `now` reads Date.now on each call (not a reference taken once), so tests that fake Date also move the process-wide store.
export function createMemoryStore({ maxRooms = 500, maxOrders = 30, ttlMs = 2 * 60 * 60 * 1000, now = () => Date.now() } = {}): RoomStore {
  const rooms = new Map<string, Entry>();

  const touch = (r: Entry) => {
    r.touchedAt = now();
    // Map keeps insertion order; re-inserting puts the most recently touched room last.
    rooms.delete(r.id);
    rooms.set(r.id, r);
  };
  const must = (id: string) => {
    const r = rooms.get(id);
    if (!r) throw new RoomError("not_found");
    return r;
  };
  const orderOf = (r: Entry, orderId: string) => {
    const i = r.orders.findIndex((o) => o.id === orderId);
    if (i < 0) throw new RoomError("not_found");
    return i;
  };
  // Each listener is isolated: one that throws (e.g. a dead live stream) is dropped, and the others
  // still get the event, so an order that was stored is never reported as failed.
  const emit = (r: Entry, e: RoomEvent) => {
    for (const fn of [...r.listeners]) {
      try {
        fn(e);
      } catch {
        r.listeners.delete(fn);
      }
    }
  };
  // The menu array is replaced, never changed in place, so a menu already sent in an event stays as it was.
  const setMenu = (r: Entry, menu: MenuItem[]) => {
    r.menu = menu;
    touch(r);
    emit(r, { type: "menu", menu });
  };

  const seed = (r: Entry, table: number, lines: CartLine[], status: Order["status"], minutesAgo: number): Order => {
    const t = now() - minutesAgo * 60_000;
    const { lines: priced, total } = priceOrder(lines, r.menu);
    return { id: `A${++r.seq}`, room: r.id, table, lines: priced, total, payment: "khqr", status, at: { new: t, preparing: t + 30_000, ...(status === "ready" && { ready: t + 180_000 }) } };
  };

  return {
    create() {
      while (rooms.size >= maxRooms) rooms.delete(rooms.keys().next().value!);
      const r: Entry = {
        id: randomBytes(12).toString("base64url"),
        orders: [],
        menu: copyMenu(),
        settings: { ...DEFAULT_SETTINGS },
        pin: String(randomInt(0, 10_000)).padStart(4, "0"),
        touchedAt: now(),
        added: 0,
        seq: 9,
        itemSeq: 0,
        pinFails: [],
        listeners: new Set(),
      };
      r.orders.push(
        seed(r, 7, [{ itemId: "iced-khmer-coffee", qty: 2, options: {} }], "ready", 6),
        seed(r, 2, [{ itemId: "matcha-latte", qty: 1, options: {} }, { itemId: "mango-smoothie", qty: 1, options: {} }], "preparing", 4),
      );
      rooms.set(r.id, r);
      return r;
    },
    get: (id) => rooms.get(id),
    addOrder(id, table, lines, expectedTotal) {
      const r = must(id);
      if (r.added >= maxOrders) throw new RoomError("full");
      if (!isOpen(r.settings, now())) throw new RoomError("closed");
      if (!Number.isInteger(table) || table < 1 || table > r.settings.tables) throw new RoomError("bad_table");
      const { lines: priced, total } = priceOrder(lines, r.menu);
      const off = priced.find((l) => r.menu.some((m) => m.id === l.itemId && (m.soldOut || m.hidden)));
      if (off) throw new RoomError("sold_out", { itemId: off.itemId });
      if (expectedTotal !== undefined && Math.round(expectedTotal * 100) !== Math.round(total * 100)) throw new RoomError("price_changed", { total });
      const order: Order = { id: `A${++r.seq}`, room: id, table, lines: priced, total, payment: "khqr", status: "new", at: { new: now() } };
      r.orders.push(order);
      r.added++;
      touch(r);
      emit(r, { type: "order", order });
      return order;
    },
    advance(id, orderId) {
      const r = must(id);
      const i = orderOf(r, orderId);
      const cur = r.orders[i];
      const status = NEXT[cur.status];
      const order = status === cur.status ? cur : { ...cur, status, at: { ...cur.at, [status]: now() } };
      r.orders[i] = order;
      touch(r);
      if (order !== cur) emit(r, { type: "order", order });
      return order;
    },
    setOrderStatus(id, orderId, status, reason) {
      const r = must(id);
      if (status !== "done" && status !== "cancelled") throw new AdminError("status");
      const cancelReason = status === "cancelled" ? parseReason(reason) : undefined;
      const i = orderOf(r, orderId);
      const cur = r.orders[i];
      if (!OPEN.includes(cur.status)) throw new RoomError("bad_status");
      const order: Order = { ...cur, status, at: { ...cur.at, [status]: now() }, ...(cancelReason && { cancelReason }) };
      r.orders[i] = order;
      touch(r);
      emit(r, { type: "order", order });
      return order;
    },
    updateItem(id, patch) {
      const r = must(id);
      const itemId = patch && typeof patch === "object" ? (patch as { id?: unknown }).id : undefined;
      if (typeof itemId !== "string") throw new AdminError("id");
      const cur = r.menu.find((m) => m.id === itemId);
      if (!cur) throw new RoomError("not_found");
      const item = editItem(cur, patch);
      setMenu(r, r.menu.map((m) => (m === cur ? item : m)));
      return item;
    },
    addItem(id, input) {
      const r = must(id);
      if (r.menu.length >= MAX_ITEMS) throw new RoomError("too_many_items");
      let itemId: string;
      do itemId = `item-${++r.itemSeq}`;
      while (r.menu.some((m) => m.id === itemId));
      const item = newItem(input, itemId);
      setMenu(r, [...r.menu, item]);
      return item;
    },
    setSettings(id, input) {
      const r = must(id);
      const settings = parseSettings(input);
      r.settings = settings;
      touch(r);
      emit(r, { type: "settings", settings });
      return settings;
    },
    reset(id) {
      const r = must(id);
      setMenu(r, copyMenu());
      r.settings = { ...DEFAULT_SETTINGS };
      emit(r, { type: "settings", settings: r.settings });
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
      for (const r of rooms.values()) if (r.touchedAt < cutoff) rooms.delete(r.id);
    },
  };
}
