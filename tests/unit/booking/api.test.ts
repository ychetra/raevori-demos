import { afterEach, describe, expect, test, vi } from "vitest";
import { POST as createRoom } from "@/app/api/bookings/route";
import { GET as getRoom } from "@/app/api/bookings/[id]/route";
import { POST as hold } from "@/app/api/bookings/[id]/holds/route";
import { POST as pay } from "@/app/api/bookings/[id]/holds/[hid]/pay/route";
import { POST as setStatus } from "@/app/api/bookings/[id]/[bid]/status/route";
import { GET as events } from "@/app/api/bookings/[id]/events/route";
import { availability } from "@/features/booking/availability";
import { HOLD_MS } from "@/features/booking/salon";
import { store } from "@/features/booking/server";
import type { Booking } from "@/features/booking/types";
import { DAY_MS, startOfDay } from "@/features/shop-pulse/time";

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) }) as never;
const json = (body: unknown) => new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const post = () => new Request("http://x/api", { method: "POST" });

let ipSeq = 0;
const roomReq = (ip?: string) => new Request("http://x/api/bookings", { method: "POST", headers: ip === undefined ? { "cf-connecting-ip": `10.5.0.${++ipSeq}` } : ip ? { "cf-connecting-ip": ip } : {} });

async function newRoom() {
  const res = await createRoom(roomReq());
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Tomorrow's first free haircut start (always within the 7 bookable days, whatever the time now). */
const freeStart = (id: string) => availability(store.get(id)!.bookings, "haircut", "any", startOfDay(Date.now()) + DAY_MS, Date.now())[0];
const holdBody = (id: string) => ({ service: "haircut", stylist: "any", start: freeStart(id), name: "Sophea" });

async function newHold(id: string) {
  const res = await hold(json(holdBody(id)), ctx({ id }));
  expect(res.status).toBe(201);
  return (await res.json()) as Booking;
}

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended");
    buf += dec.decode(value);
    const m = buf.match(/data: (.*)\n\n/);
    if (m) return JSON.parse(m[1]);
  }
}

describe("bookings API", () => {
  test("creates a room and returns its seeded snapshot", async () => {
    const id = await newRoom();
    const res = await getRoom(new Request("http://x"), ctx({ id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { bookings } = (await res.json()) as { bookings: Booking[] };
    expect(bookings.length).toBeGreaterThan(20);
    expect(bookings.every((b) => b.room === id)).toBe(true);
  });

  test("one IP gets 20 rooms an hour; the 21st is 429 too_many_rooms, another IP still gets one", async () => {
    for (let i = 0; i < 20; i++) expect((await createRoom(roomReq("203.0.113.29"))).status).toBe(201);
    const res = await createRoom(roomReq("203.0.113.29"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_rooms" });
    expect((await createRoom(roomReq("203.0.113.30"))).status).toBe(201);
  });

  test("unknown room is 404 not_found everywhere", async () => {
    const id = "doesnotexist";
    const res = await getRoom(new Request("http://x"), ctx({ id }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect((await hold(json({ service: "haircut", stylist: "any", start: 0, name: "A" }), ctx({ id }))).status).toBe(404);
    expect((await pay(post(), ctx({ id, hid: "x" }))).status).toBe(404);
    expect((await setStatus(json({ status: "arrived" }), ctx({ id, bid: "x" }))).status).toBe(404);
    expect((await events(new Request("http://x"), ctx({ id }))).status).toBe(404);
  });

  test("a hold is a 201 with the held booking; the same slot again is 409 taken", async () => {
    const id = await newRoom();
    const body = { ...holdBody(id), stylist: "bopha", start: availability(store.get(id)!.bookings, "haircut", "bopha", startOfDay(Date.now()) + DAY_MS, Date.now())[0] };
    const res = await hold(json(body), ctx({ id }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const h = (await res.json()) as Booking;
    expect(h).toMatchObject({ room: id, service: "haircut", stylist: "bopha", start: body.start, name: "Sophea", status: "held" });
    expect(h.holdUntil! - h.at.held!).toBe(HOLD_MS);
    const again = await hold(json({ ...body, name: "Vanna" }), ctx({ id }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "taken" });
  });

  test("two phones racing for one slot: one 201, one 409", async () => {
    const id = await newRoom();
    const body = { ...holdBody(id), stylist: "dara", start: availability(store.get(id)!.bookings, "haircut", "dara", startOfDay(Date.now()) + DAY_MS, Date.now())[0] };
    const statuses = (await Promise.all([hold(json(body), ctx({ id })), hold(json(body), ctx({ id }))])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
  });

  test.each<[string, unknown, string]>([
    ["bad JSON", "{not json", "bad_json"],
    ["no service", { stylist: "any", start: 1, name: "A" }, "bad_service"],
    ["unknown service", { service: "massage", stylist: "any", start: 1, name: "A" }, "bad_service"],
    ["inherited service key", { service: "toString", stylist: "any", start: 1, name: "A" }, "bad_service"],
    ["unknown stylist", { service: "haircut", stylist: "sokha", start: 1, name: "A" }, "bad_stylist"],
    ["start as text", { service: "haircut", stylist: "any", start: "10:00", name: "A" }, "bad_start"],
    ["off-grid start", { service: "haircut", stylist: "any", start: startOfDay(Date.now()) + DAY_MS + 10 * 3_600_000 + 60_000, name: "A" }, "bad_start"],
    ["start 8 days ahead", { service: "haircut", stylist: "any", start: startOfDay(Date.now()) + 8 * DAY_MS + 10 * 3_600_000, name: "A" }, "bad_start"],
    ["no name", { service: "haircut", stylist: "any", start: startOfDay(Date.now()) + DAY_MS + 10 * 3_600_000 }, "bad_name"],
    ["blank name", { service: "haircut", stylist: "any", start: startOfDay(Date.now()) + DAY_MS + 10 * 3_600_000, name: "  " }, "bad_name"],
    ["phone as a number", { service: "haircut", stylist: "any", start: startOfDay(Date.now()) + DAY_MS + 10 * 3_600_000, name: "A", phone: 12345 }, "bad_phone"],
    ["long phone", { service: "haircut", stylist: "any", start: startOfDay(Date.now()) + DAY_MS + 10 * 3_600_000, name: "A", phone: "1".repeat(21) }, "bad_phone"],
  ])("a hold with %s is 400 %s", async (_n, body, code) => {
    const id = await newRoom();
    const res = await hold(json(body), ctx({ id }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: code });
  });

  test("paying a hold is 200 booked; an unknown hold is 404", async () => {
    const id = await newRoom();
    const h = await newHold(id);
    const res = await pay(post(), ctx({ id, hid: h.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: h.id, status: "booked" });
    expect((await pay(post(), ctx({ id, hid: "nope" }))).status).toBe(404);
  });

  test("staff status: 200 from booked, 409 from the wrong state, 400 for a bad status", async () => {
    const id = await newRoom();
    const h = await newHold(id);
    const early = await setStatus(json({ status: "arrived" }), ctx({ id, bid: h.id }));
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ error: "wrong_state" });
    await pay(post(), ctx({ id, hid: h.id }));
    const res = await setStatus(json({ status: "noshow" }), ctx({ id, bid: h.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: h.id, status: "noshow" });
    expect((await setStatus(json({ status: "arrived" }), ctx({ id, bid: h.id }))).status).toBe(409);
    expect((await setStatus(json({ status: "booked" }), ctx({ id, bid: h.id }))).status).toBe(400);
    expect((await setStatus(json("{nope"), ctx({ id, bid: h.id }))).status).toBe(400);
    expect((await setStatus(json({ status: "arrived" }), ctx({ id, bid: "nope" }))).status).toBe(404);
  });

  test("events stream starts with a snapshot, then pushes booking changes", async () => {
    const id = await newRoom();
    const abort = new AbortController();
    const res = await events(new Request("http://x", { signal: abort.signal }), ctx({ id }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    const first = await readEvent(reader);
    expect(first.type).toBe("snapshot");
    expect(first.bookings).toEqual(store.get(id)!.bookings);
    const h = await newHold(id);
    expect(await readEvent(reader)).toEqual({ type: "booking", booking: h });
    abort.abort();
  });

  describe("with a fake clock", () => {
    afterEach(() => vi.useRealTimers());

    test("paying after the hold ran out is 410 expired", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const id = await newRoom();
      const h = await newHold(id);
      vi.setSystemTime(Date.now() + HOLD_MS);
      const res = await pay(post(), ctx({ id, hid: h.id }));
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ error: "expired" });
    });

    test("the stream sends a run-out hold as expired within seconds, pings every 20 s, and closes once the room has expired", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      const id = await newRoom();
      const h = await newHold(id);
      const res = await events(new Request("http://x"), ctx({ id }));
      const reader = res.body!.getReader();
      expect((await readEvent(reader)).type).toBe("snapshot");
      vi.setSystemTime(Date.now() + HOLD_MS);
      vi.advanceTimersByTime(5_000);
      expect(await readEvent(reader)).toMatchObject({ type: "booking", booking: { id: h.id, status: "expired" } });
      vi.advanceTimersByTime(15_000);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(": ping\n\n");
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000 + 1);
      store.sweep();
      vi.advanceTimersByTime(5_000);
      expect(await readEvent(reader)).toEqual({ type: "closed" });
      expect((await reader.read()).done).toBe(true);
    });
  });
});
