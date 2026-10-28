import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { POST as createRoom } from "@/app/api/bookings/route";
import { GET as getRoom } from "@/app/api/bookings/[id]/route";
import { POST as hold } from "@/app/api/bookings/[id]/holds/route";
import { POST as pay } from "@/app/api/bookings/[id]/holds/[hid]/pay/route";
import { GET as events } from "@/app/api/bookings/[id]/events/route";
import { GET as session, POST as login } from "@/app/api/bookings/[id]/admin/login/route";
import { PUT as editService } from "@/app/api/bookings/[id]/admin/services/route";
import { POST as addStylist, PUT as editStylist } from "@/app/api/bookings/[id]/admin/stylists/route";
import { PUT as saveSettings } from "@/app/api/bookings/[id]/admin/settings/route";
import { PATCH as patchBooking } from "@/app/api/bookings/[id]/admin/bookings/[bid]/route";
import { GET as exportCsv } from "@/app/api/bookings/[id]/admin/export.csv/route";
import { POST as reset } from "@/app/api/bookings/[id]/admin/reset/route";
import { POST as createCafe } from "@/app/api/rooms/route";
import { POST as cafeLogin } from "@/app/api/rooms/[id]/admin/login/route";
import { availability } from "@/features/booking/availability";
import { DEFAULT_SETTINGS, defaultSalon } from "@/features/booking/salon";
import { store } from "@/features/booking/server";
import type { Booking } from "@/features/booking/types";
import { PP_OFFSET_MS } from "@/features/shop-pulse/time";

process.env.SESSION_SECRET = "test-secret";

const pp = (h: number, min = 0, day = 0) => Date.UTC(2026, 9, 28 + day, h, min) - PP_OFFSET_MS;
// Only Date is faked: noon Phnom Penh on Wed 2026-10-28 whatever time the tests run; timers stay real for the SSE stream.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(pp(12));
});
afterAll(() => vi.useRealTimers());

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) }) as never;
const req = (method: string, body?: unknown, cookie?: string, url = "https://demo.raevori.com/api") =>
  new Request(url, { method, headers: cookie ? { cookie } : {}, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

let ipSeq = 0;
async function newRoom() {
  const res = await createRoom(new Request("http://x/api/bookings", { method: "POST", headers: { "cf-connecting-ip": `10.8.${Math.floor(++ipSeq / 200)}.${ipSeq % 200}` } }));
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
/** Tomorrow's first free haircut start for `stylist`. */
const freeStart = (id: string, stylist = "bopha") => availability(store.get(id)!.bookings, "haircut", stylist, pp(0, 0, 1), Date.now(), store.get(id)!)[0];
async function booked(id: string, body: Record<string, unknown> = {}) {
  const res = await hold(req("POST", { service: "haircut", stylist: "bopha", start: freeStart(id), name: "Sophea", phone: "012 345 678", ...body }), ctx({ id }));
  expect(res.status).toBe(201);
  const h = (await res.json()) as Booking;
  return (await (await pay(req("POST"), ctx({ id, hid: h.id }))).json()) as Booking;
}
async function firstEvent(id: string) {
  const abort = new AbortController();
  const res = await events(new Request("http://x", { signal: abort.signal }), ctx({ id }));
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  return { text, event: JSON.parse(text.match(/data: (.*)\n\n/)![1]), reader, abort };
}

describe("PIN and snapshots", () => {
  test("the creator gets the PIN; the snapshot and the event stream carry the config but never the PIN or a phone", async () => {
    const { id, pin } = await newRoom();
    expect(pin).toMatch(/^\d{4}$/);
    await booked(id);
    const snap = await (await getRoom(req("GET"), ctx({ id }))).json();
    expect(snap).toEqual({ bookings: expect.any(Array), ...defaultSalon() });
    const { text, event, abort } = await firstEvent(id);
    abort.abort();
    expect(event).toEqual({ type: "snapshot", bookings: expect.any(Array), ...defaultSalon() });
    const all = JSON.stringify(snap) + text;
    expect(all).not.toContain(`"pin"`);
    expect(all).not.toContain(`"phone"`);
    expect(all).not.toContain("012 345 678");
  });

  test("an admin change reaches the stream as a config event, without the PIN", async () => {
    const { id, cookie } = await admin();
    const { reader, abort } = await firstEvent(id);
    await editService(req("PUT", { service: { id: "haircut", price: 9 } }, cookie), ctx({ id }));
    const { value } = await reader.read();
    abort.abort();
    const text = new TextDecoder().decode(value);
    const e = JSON.parse(text.match(/data: (.*)\n\n/)![1]);
    expect(e.type).toBe("config");
    expect(e.services[0]).toEqual({ id: "haircut", minutes: 30, price: 9 });
    expect(text).not.toContain(`"pin"`);
  });

  test("login sets an HttpOnly, SameSite=Lax, Secure cookie scoped to the room's admin for 2 hours", async () => {
    const { id, pin } = await newRoom();
    const res = await login(req("POST", { pin }), ctx({ id }));
    expect(res.status).toBe(204);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/^ra_salon_admin=[^;]+/);
    expect(set).toContain(`Path=/api/bookings/${id}/admin`);
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
      expect(await res.json()).toEqual({ error: "wrong_pin" });
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    const sixth = await login(req("POST", { pin: wrongPin(pin) }), ctx({ id }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "too_many_tries" });
    expect((await login(req("POST", { pin }), ctx({ id }))).status).toBe(429);
    expect((await login(req("POST", { pin: "1234" }), ctx({ id: "nope" }))).status).toBe(404);
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
  const calls = (id: string, cookie?: string, bid = "x") => [
    editService(req("PUT", { service: { id: "haircut", price: 9 } }, cookie), ctx({ id })),
    editStylist(req("PUT", { stylist: { id: "dara", daysOff: [1] } }, cookie), ctx({ id })),
    addStylist(req("POST", { stylist: { name: { en: "Nita", km: "នីតា" } } }, cookie), ctx({ id })),
    saveSettings(req("PUT", DEFAULT_SETTINGS, cookie), ctx({ id })),
    patchBooking(req("PATCH", { action: "cancel", reason: "Sick", refund: true }, cookie), ctx({ id, bid })),
    exportCsv(req("GET", undefined, cookie), ctx({ id })),
    reset(req("POST", undefined, cookie), ctx({ id })),
  ];

  test("401 without the cookie, with a forged one, another room's, or the café's; 404 for an unknown room", async () => {
    const a = await admin();
    const b = await admin();
    for (const res of await Promise.all(calls(a.id))) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls(a.id, b.cookie))) expect(res.status).toBe(401);
    const forged = a.cookie.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
    for (const res of await Promise.all(calls(a.id, forged))) expect(res.status).toBe(401);
    // A café admin cookie signed for the same id string is a different purpose, so it never opens the salon.
    const cafe = (await (await createCafe(new Request("http://x/api/rooms", { method: "POST", headers: { "cf-connecting-ip": "10.7.0.1" } }))).json()) as { id: string; pin: string };
    const cafeCookie = (await cafeLogin(req("POST", { pin: cafe.pin }), ctx({ id: cafe.id }))).headers.get("set-cookie")!.split(";")[0].replace(/^ra_admin=/, "ra_salon_admin=");
    expect((await session(req("GET", undefined, cafeCookie), ctx({ id: cafe.id }))).status).toBe(404);
    expect((await session(req("GET", undefined, cafeCookie), ctx({ id: a.id }))).status).toBe(401);
    for (const res of await Promise.all(calls("nope", a.cookie))) expect(res.status).toBe(404);
    const unauth = await editService(req("PUT", { service: { id: "haircut", price: 9 } }), ctx({ id: a.id }));
    expect(await unauth.json()).toEqual({ error: "login" });
  });

  test("with the cookie, each route works", async () => {
    const { id, cookie } = await admin();
    const b = await booked(id);
    const statuses = [];
    for (const call of calls(id, cookie, b.id)) statuses.push((await call).status);
    expect(statuses).toEqual([200, 200, 201, 200, 200, 200, 200]);
  });
});

describe("services, stylists and settings", () => {
  test("a service edit is used by the next hold; existing bookings keep their price", async () => {
    const { id, cookie } = await admin();
    const before = await booked(id);
    const res = await editService(req("PUT", { service: { id: "haircut", price: 12, minutes: 60 } }, cookie), ctx({ id }));
    expect(await res.json()).toEqual({ id: "haircut", minutes: 60, price: 12 });
    await saveSettings(req("PUT", { ...DEFAULT_SETTINGS, deposit: 4.5 }, cookie), ctx({ id }));
    const after = await booked(id);
    expect(after).toMatchObject({ price: 12, deposit: 4.5 });
    expect(after.end - after.start).toBe(60 * 60_000);
    const snap = (await (await getRoom(req("GET"), ctx({ id }))).json()) as { bookings: Booking[] };
    expect(snap.bookings.find((x) => x.id === before.id)).toMatchObject({ price: 8, deposit: 3 });
  });

  test("a hidden service is 400 bad_service; a stylist's day off is 409 taken; an unknown stylist is 400 bad_stylist", async () => {
    const { id, cookie } = await admin();
    await editService(req("PUT", { service: { id: "wash", hidden: true } }, cookie), ctx({ id }));
    const hidden = await hold(req("POST", { service: "wash", stylist: "any", start: freeStart(id), name: "A" }), ctx({ id }));
    expect(hidden.status).toBe(400);
    expect(await hidden.json()).toEqual({ error: "bad_service" });
    await editStylist(req("PUT", { stylist: { id: "dara", daysOff: [5] } }, cookie), ctx({ id }));
    const off = await hold(req("POST", { service: "haircut", stylist: "dara", start: pp(10, 0, 2), name: "A" }), ctx({ id }));
    expect(off.status).toBe(409);
    expect(await off.json()).toEqual({ error: "taken" });
    const added = await (await addStylist(req("POST", { stylist: { name: { en: "Nita", km: "នីតា" } } }, cookie), ctx({ id }))).json();
    const nita = await hold(req("POST", { service: "haircut", stylist: added.id, start: pp(10, 0, 2), name: "A" }), ctx({ id }));
    expect(nita.status).toBe(201);
    const unknown = await hold(req("POST", { service: "haircut", stylist: "sokha", start: pp(10, 0, 2), name: "A" }), ctx({ id }));
    expect(await unknown.json()).toEqual({ error: "bad_stylist" });
  });

  test("the 6th stylist is 409 too_many_stylists", async () => {
    const { id, cookie } = await admin();
    const add = () => addStylist(req("POST", { stylist: { name: { en: "Nita", km: "នីតា" } } }, cookie), ctx({ id }));
    expect((await add()).status).toBe(201);
    expect((await add()).status).toBe(201);
    const res = await add();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "too_many_stylists" });
  });

  test.each<[string, string, unknown, string]>([
    ["bad JSON", "service", "{x", "bad_json"],
    ["no service", "service", {}, "invalid"],
    ["a 45-minute service", "service", { service: { id: "haircut", minutes: 45 } }, "invalid"],
    ["no stylist", "stylist", { name: "x" }, "invalid"],
    ["day 7 off", "stylist", { stylist: { id: "bopha", daysOff: [7] } }, "invalid"],
    ["a nameless new stylist", "add", { stylist: { daysOff: [] } }, "invalid"],
    ["a $11 deposit", "settings", { ...DEFAULT_SETTINGS, deposit: 11 }, "invalid"],
    ["a quarter-hour opening", "settings", { ...DEFAULT_SETTINGS, open: "09:15" }, "invalid"],
  ])("%s is a 400", async (_name, route, body, error) => {
    const { id, cookie } = await admin();
    const res =
      route === "service" ? await editService(req("PUT", body, cookie), ctx({ id }))
      : route === "stylist" ? await editStylist(req("PUT", body, cookie), ctx({ id }))
      : route === "add" ? await addStylist(req("POST", body, cookie), ctx({ id }))
      : await saveSettings(req("PUT", body, cookie), ctx({ id }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
  });

  test("an unknown service or stylist is 404", async () => {
    const { id, cookie } = await admin();
    expect((await editService(req("PUT", { service: { id: "massage", price: 9 } }, cookie), ctx({ id }))).status).toBe(404);
    expect((await editStylist(req("PUT", { stylist: { id: "sokha", daysOff: [] } }, cookie), ctx({ id }))).status).toBe(404);
  });
});

describe("cancel and move", () => {
  test("cancel stores the reason and refund; the customer's GET shows it", async () => {
    const { id, cookie } = await admin();
    const b = await booked(id);
    const res = await patchBooking(req("PATCH", { action: "cancel", reason: "Stylist is sick", refund: true }, cookie), ctx({ id, bid: b.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: b.id, status: "cancelled", refund: true, cancelReason: "Stylist is sick" });
    expect(body).not.toHaveProperty("phone");
    const kept = await booked(id);
    expect(await (await patchBooking(req("PATCH", { action: "cancel", reason: "No-show call", refund: false }, cookie), ctx({ id, bid: kept.id }))).json()).toMatchObject({ refund: false });
    const snap = (await (await getRoom(req("GET"), ctx({ id }))).json()) as { bookings: Booking[] };
    expect(snap.bookings.find((x) => x.id === b.id)).toMatchObject({ status: "cancelled", refund: true });
    const again = await patchBooking(req("PATCH", { action: "cancel", reason: "x", refund: true }, cookie), ctx({ id, bid: b.id }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "wrong_state" });
  });

  test("move to a free start keeps the id; a taken start is 409 taken", async () => {
    const { id, cookie } = await admin();
    const b = await booked(id);
    const to = pp(11, 0, 3);
    const res = await patchBooking(req("PATCH", { action: "move", start: to, stylist: "dara" }, cookie), ctx({ id, bid: b.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: b.id, start: to, end: to + 30 * 60_000, stylist: "dara", status: "booked" });
    const other = await booked(id);
    const clash = await patchBooking(req("PATCH", { action: "move", start: other.start, stylist: other.stylist }, cookie), ctx({ id, bid: b.id }));
    expect(clash.status).toBe(409);
    expect(await clash.json()).toEqual({ error: "taken" });
    const snap = (await (await getRoom(req("GET"), ctx({ id }))).json()) as { bookings: Booking[] };
    expect(snap.bookings.find((x) => x.id === b.id)).toMatchObject({ start: to, stylist: "dara" });
  });

  test.each<[string, unknown, number, string]>([
    ["no action", { reason: "x" }, 400, "invalid"],
    ["an empty reason", { action: "cancel", reason: "", refund: true }, 400, "invalid"],
    ["no refund choice", { action: "cancel", reason: "x" }, 400, "invalid"],
    ["an off-grid move", { action: "move", start: pp(10, 15, 3) }, 400, "bad_start"],
    ["a move to an unknown stylist", { action: "move", start: pp(10, 0, 3), stylist: "sokha" }, 400, "bad_stylist"],
  ])("%s is %i %s", async (_name, body, status, error) => {
    const { id, cookie } = await admin();
    const b = await booked(id);
    const res = await patchBooking(req("PATCH", body, cookie), ctx({ id, bid: b.id }));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
  });

  test("an unknown booking is 404", async () => {
    const { id, cookie } = await admin();
    expect((await patchBooking(req("PATCH", { action: "cancel", reason: "x", refund: true }, cookie), ctx({ id, bid: "nope" }))).status).toBe(404);
  });
});

describe("reset", () => {
  test("restores the default config, keeps the bookings and the PIN", async () => {
    const { id, pin, cookie } = await admin();
    await editService(req("PUT", { service: { id: "haircut", price: 20 } }, cookie), ctx({ id }));
    await addStylist(req("POST", { stylist: { name: { en: "Nita", km: "នីតា" } } }, cookie), ctx({ id }));
    await saveSettings(req("PUT", { ...DEFAULT_SETTINGS, name: "Lotus Spa" }, cookie), ctx({ id }));
    const b = await booked(id);
    const res = await reset(req("POST", undefined, cookie), ctx({ id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ bookings: expect.any(Array), ...defaultSalon() });
    expect(JSON.stringify(body)).not.toContain(`"pin"`);
    expect(JSON.stringify(body)).not.toContain(`"phone"`);
    expect(body.bookings.find((x: Booking) => x.id === b.id)).toMatchObject({ price: 20 });
    expect((await login(req("POST", { pin }), ctx({ id }))).status).toBe(204);
  });
});

describe("CSV export", () => {
  test("is UTF-8 CSV with a BOM, the header, the phone, and escaped names", async () => {
    const { id, cookie } = await admin();
    const b = await booked(id, { name: 'Ly, "Na"' });
    const res = await exportCsv(req("GET", undefined, cookie), ctx({ id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="bookings-2026-10-28.csv"`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n");
    expect(rows[0]).toBe("date,time,customer,phone,stylist,service,price,deposit,status");
    const t = new Date(b.start + PP_OFFSET_MS).toISOString();
    expect(rows).toContain(`${t.slice(0, 10)},${t.slice(11, 16)},"Ly, ""Na""",012 345 678,Bopha,Haircut,8.00,3.00,booked`);
    expect(rows.length).toBe(store.get(id)!.bookings.length + 1);
    const km = await (await exportCsv(req("GET", undefined, cookie, "https://demo.raevori.com/api?lang=km"), ctx({ id }))).text();
    expect(km).toContain("បុប្ផា,កាត់សក់");
  });
});
