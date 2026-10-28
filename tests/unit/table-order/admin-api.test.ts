import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { POST as createRoom } from "@/app/api/rooms/route";
import { GET as getRoom } from "@/app/api/rooms/[id]/route";
import { POST as postOrder } from "@/app/api/rooms/[id]/orders/route";
import { GET as events } from "@/app/api/rooms/[id]/events/route";
import { GET as session, POST as login } from "@/app/api/rooms/[id]/admin/login/route";
import { POST as addItem, PUT as editItem } from "@/app/api/rooms/[id]/admin/menu/route";
import { PATCH as setStatus } from "@/app/api/rooms/[id]/admin/orders/[orderId]/route";
import { PUT as saveSettings } from "@/app/api/rooms/[id]/admin/settings/route";
import { GET as exportCsv } from "@/app/api/rooms/[id]/admin/export.csv/route";
import { POST as reset } from "@/app/api/rooms/[id]/admin/reset/route";
import { DEFAULT_SETTINGS } from "@/features/table-order/admin";
import { MENU } from "@/features/table-order/menu";
import { PP_OFFSET_MS } from "@/features/shop-pulse/time";

process.env.SESSION_SECRET = "test-secret";

const pp = (h: number, min = 0) => Date.UTC(2026, 9, 28, h, min) - PP_OFFSET_MS;
// Only Date is faked: the shop is open at noon Phnom Penh whatever time the tests run; timers stay real for the SSE stream.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(pp(12));
});
afterAll(() => vi.useRealTimers());

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) }) as never;
const req = (method: string, body?: unknown, cookie?: string) =>
  new Request("https://demo.raevori.com/api", { method, headers: cookie ? { cookie } : {}, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const latte = [{ itemId: "iced-latte", qty: 1, options: {} }];

let ipSeq = 0;
async function newRoom() {
  const res = await createRoom(new Request("http://x/api/rooms", { method: "POST", headers: { "cf-connecting-ip": `10.9.0.${++ipSeq}` } }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; pin: string };
}
async function admin() {
  const room = await newRoom();
  const res = await login(req("POST", { pin: room.pin }), ctx({ id: room.id }));
  expect(res.status).toBe(204);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { ...room, cookie };
}
const wrongPin = (pin: string) => (pin === "0000" ? "1111" : "0000");

describe("PIN and snapshots", () => {
  test("the creator gets the PIN; the snapshot and the event stream carry menu and settings but never the PIN", async () => {
    const { id, pin } = await newRoom();
    expect(pin).toMatch(/^\d{4}$/);
    const snap = await (await getRoom(req("GET"), ctx({ id }))).json();
    expect(snap).toEqual({ orders: expect.any(Array), menu: MENU, settings: DEFAULT_SETTINGS });
    const abort = new AbortController();
    const res = await events(new Request("http://x", { signal: abort.signal }), ctx({ id }));
    const { value } = await res.body!.getReader().read();
    const text = new TextDecoder().decode(value);
    abort.abort();
    const first = JSON.parse(text.match(/data: (.*)\n\n/)![1]);
    expect(first).toEqual({ type: "snapshot", orders: expect.any(Array), menu: MENU, settings: DEFAULT_SETTINGS });
    expect(JSON.stringify(snap) + text).not.toContain(`"pin"`);
  });

  test("login sets an HttpOnly, SameSite=Lax, Secure cookie scoped to the room for 2 hours", async () => {
    const { id, pin } = await newRoom();
    const res = await login(req("POST", { pin }), ctx({ id }));
    expect(res.status).toBe(204);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/^ra_admin=[^;]+/);
    expect(set).toContain(`Path=/api/rooms/${id}/admin`);
    expect(set).toContain("Max-Age=7200");
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Secure/);
    const cookie = set.split(";")[0];
    expect((await session(req("GET", undefined, cookie), ctx({ id }))).status).toBe(204);
    expect((await session(req("GET"), ctx({ id }))).status).toBe(401);
  });

  test("a wrong PIN is 401; the 6th wrong PIN in 10 minutes is 429, and so is the right one after it", async () => {
    const { id, pin } = await newRoom();
    for (let i = 0; i < 5; i++) {
      const res = await login(req("POST", { pin: wrongPin(pin) }), ctx({ id }));
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    const sixth = await login(req("POST", { pin: wrongPin(pin) }), ctx({ id }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "too_many_tries" });
    expect((await login(req("POST", { pin }), ctx({ id }))).status).toBe(429);
    expect((await login(req("POST", { pin: 1234 }), ctx({ id: "nope" }))).status).toBe(404);
    expect((await login(req("POST", "{bad"), ctx({ id }))).status).toBe(400);
  });

  test("the cookie expires after 2 hours", async () => {
    const { id, cookie } = await admin();
    vi.setSystemTime(pp(14, 1));
    try {
      expect((await session(req("GET", undefined, cookie), ctx({ id }))).status).toBe(401);
    } finally {
      vi.setSystemTime(pp(12));
    }
  });
});

describe("admin routes need the room's cookie", () => {
  const calls = (id: string, cookie?: string) => [
    editItem(req("PUT", { item: { id: "iced-latte", soldOut: true } }, cookie), ctx({ id })),
    addItem(req("POST", { item: { name: { en: "Tea", km: "តែ" }, price: 1, cat: "tea" } }, cookie), ctx({ id })),
    setStatus(req("PATCH", { status: "done" }, cookie), ctx({ id, orderId: "A10" })),
    saveSettings(req("PUT", DEFAULT_SETTINGS, cookie), ctx({ id })),
    exportCsv(req("GET", undefined, cookie), ctx({ id })),
    reset(req("POST", undefined, cookie), ctx({ id })),
  ];

  test("401 without the cookie, 401 with a forged or other room's cookie, 404 for an unknown room", async () => {
    const a = await admin();
    const b = await admin();
    for (const res of await Promise.all(calls(a.id))) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls(a.id, b.cookie))) expect(res.status).toBe(401);
    const forged = a.cookie.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
    for (const res of await Promise.all(calls(a.id, forged))) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls("nope", a.cookie))) expect(res.status).toBe(404);
  });

  test("with the cookie, each route works", async () => {
    const { id, cookie } = await admin();
    const statuses = [];
    for (const call of calls(id, cookie)) statuses.push((await call).status);
    expect(statuses).toEqual([200, 201, 200, 200, 200, 200]);
  });
});

describe("menu, orders and settings", () => {
  test("PUT edits an item and the next order uses the new price; POST adds one with a server id", async () => {
    const { id, cookie } = await admin();
    const edited = await editItem(req("PUT", { item: { id: "iced-latte", price: 3.5 } }, cookie), ctx({ id }));
    expect(await edited.json()).toMatchObject({ id: "iced-latte", price: 3.5 });
    expect(await (await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }))).json()).toMatchObject({ total: 3.5 });

    const added = await addItem(req("POST", { item: { id: "hack", name: { en: "Lime soda", km: "សូដា" }, price: 1.25, cat: "tea", image: "cup:#a4c639" } }, cookie), ctx({ id }));
    expect(added.status).toBe(201);
    const item = await added.json();
    expect(item.id).not.toBe("hack");
    const snap = await (await getRoom(req("GET"), ctx({ id }))).json();
    expect(snap.menu.at(-1)).toEqual(item);
  });

  test("ordering a sold-out item is 409 sold_out with its id; a stale expected total is 409 price_changed", async () => {
    const { id, cookie } = await admin();
    await editItem(req("PUT", { item: { id: "iced-latte", soldOut: true } }, cookie), ctx({ id }));
    const res = await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "sold_out", itemId: "iced-latte" });

    await editItem(req("PUT", { item: { id: "americano", price: 2 } }, cookie), ctx({ id }));
    const stale = await postOrder(req("POST", { table: 4, expectedTotal: 1.75, lines: [{ itemId: "americano", qty: 1, options: {} }] }), ctx({ id }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "price_changed", total: 2 });
    const ok = await postOrder(req("POST", { table: 4, expectedTotal: 2, lines: [{ itemId: "americano", qty: 1, options: {} }] }), ctx({ id }));
    expect(ok.status).toBe(201);
    expect((await postOrder(req("POST", { table: 4, expectedTotal: "2", lines: latte }), ctx({ id }))).status).toBe(400);
  });

  test("ordering when closed is 409 closed; a table above the room's tables is 400 bad_table", async () => {
    const { id, cookie } = await admin();
    await saveSettings(req("PUT", { ...DEFAULT_SETTINGS, open: "13:00", tables: 5 }, cookie), ctx({ id }));
    const closed = await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }));
    expect(closed.status).toBe(409);
    expect(await closed.json()).toEqual({ error: "closed" });
    await saveSettings(req("PUT", { ...DEFAULT_SETTINGS, tables: 5 }, cookie), ctx({ id }));
    const far = await postOrder(req("POST", { table: 6, lines: latte }), ctx({ id }));
    expect(far.status).toBe(400);
    expect(await far.json()).toEqual({ error: "bad_table" });
  });

  test("PATCH marks done or cancels with a reason; anything else is 400, a finished order is 409", async () => {
    const { id, cookie } = await admin();
    const order = await (await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }))).json();
    const other = await (await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }))).json();
    expect((await setStatus(req("PATCH", { status: "cancelled" }, cookie), ctx({ id, orderId: order.id }))).status).toBe(400);
    expect((await setStatus(req("PATCH", { status: "ready" }, cookie), ctx({ id, orderId: order.id }))).status).toBe(400);
    const res = await setStatus(req("PATCH", { status: "cancelled", reason: "Out of milk" }, cookie), ctx({ id, orderId: order.id }));
    expect(await res.json()).toMatchObject({ id: order.id, status: "cancelled", cancelReason: "Out of milk" });
    const again = await setStatus(req("PATCH", { status: "done" }, cookie), ctx({ id, orderId: order.id }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "bad_status" });
    expect(await (await setStatus(req("PATCH", { status: "done" }, cookie), ctx({ id, orderId: other.id }))).json()).toMatchObject({ status: "done" });
    expect((await setStatus(req("PATCH", { status: "done" }, cookie), ctx({ id, orderId: "Z9" }))).status).toBe(404);
  });

  test.each([
    ["bad JSON", "menu", "{x"],
    ["missing item", "menu", {}],
    ["long name", "menu", { item: { id: "iced-latte", name: { en: "x".repeat(41), km: "x" } } }],
    ["price step", "menu", { item: { id: "iced-latte", price: 2.3 } }],
    ["new item without a category", "add", { item: { name: { en: "x", km: "x" }, price: 1 } }],
    ["new item with a long note", "add", { item: { name: { en: "x", km: "x" }, price: 1, cat: "tea", note: { en: "x".repeat(121), km: "" } } }],
    ["close before open", "settings", { ...DEFAULT_SETTINGS, open: "10:00", close: "09:30" }],
    ["quarter-hour open", "settings", { ...DEFAULT_SETTINGS, open: "07:45" }],
    ["long reason", "status", { status: "cancelled", reason: "x".repeat(121) }],
  ])("%s is a 400", async (_name, route, body) => {
    const { id, cookie } = await admin();
    const order = await (await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }))).json();
    const res =
      route === "menu" ? await editItem(req("PUT", body, cookie), ctx({ id }))
      : route === "add" ? await addItem(req("POST", body, cookie), ctx({ id }))
      : route === "settings" ? await saveSettings(req("PUT", body, cookie), ctx({ id }))
      : await setStatus(req("PATCH", body, cookie), ctx({ id, orderId: order.id }));
    expect(res.status).toBe(400);
  });

  test("the 61st menu item is refused", async () => {
    const { id, cookie } = await admin();
    const add = () => addItem(req("POST", { item: { name: { en: "x", km: "x" }, price: 1, cat: "bakery" } }, cookie), ctx({ id }));
    for (let i = MENU.length; i < 60; i++) expect((await add()).status).toBe(201);
    const res = await add();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "too_many_items" });
  });

  test("reset restores the default menu and settings, and keeps the orders and the PIN", async () => {
    const { id, pin, cookie } = await admin();
    await editItem(req("PUT", { item: { id: "iced-latte", price: 9 } }, cookie), ctx({ id }));
    await saveSettings(req("PUT", { ...DEFAULT_SETTINGS, name: "Pepper" }, cookie), ctx({ id }));
    await postOrder(req("POST", { table: 4, lines: latte }), ctx({ id }));
    const res = await reset(req("POST", undefined, cookie), ctx({ id }));
    expect(res.status).toBe(200);
    const snap = await (await getRoom(req("GET"), ctx({ id }))).json();
    expect(snap.menu).toEqual(MENU);
    expect(snap.settings).toEqual(DEFAULT_SETTINGS);
    expect(snap.orders).toHaveLength(3);
    expect((await login(req("POST", { pin }), ctx({ id }))).status).toBe(204);
  });
});

describe("CSV export", () => {
  test("is UTF-8 CSV with a BOM, a header and escaped item names", async () => {
    const { id, cookie } = await admin();
    const add = await addItem(req("POST", { item: { name: { en: 'Cake, "big"', km: "នំ" }, price: 2, cat: "bakery", image: "loaf" } }, cookie), ctx({ id }));
    const cake = await add.json();
    await postOrder(req("POST", { table: 3, lines: [{ itemId: cake.id, qty: 1, options: {} }] }), ctx({ id }));
    const res = await exportCsv(req("GET", undefined, cookie), ctx({ id }));
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="orders-2026-10-28\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n");
    expect(rows[0]).toBe("date,time,order no.,table,items,total USD,total KHR,payment,status");
    expect(rows).toHaveLength(4); // header, two seeded orders, the cake
    expect(rows[3]).toBe('2026-10-28,12:00,A12,3,"1× Cake, ""big""",2.00,8200,KHQR,new');
    const km = await (await exportCsv(new Request(`https://demo.raevori.com/api?lang=km`, { headers: { cookie } }), ctx({ id }))).text();
    expect(km).toContain("1× នំ");
  });
});
