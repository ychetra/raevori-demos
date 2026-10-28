import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { POST as createQueue } from "@/app/api/queues/route";
import { GET as getQueue } from "@/app/api/queues/[id]/route";
import { POST as take } from "@/app/api/queues/[id]/tickets/route";
import { POST as call } from "@/app/api/queues/[id]/call/route";
import { GET as events } from "@/app/api/queues/[id]/events/route";
import { GET as session, POST as login } from "@/app/api/queues/[id]/admin/login/route";
import { POST as addService, PUT as editService } from "@/app/api/queues/[id]/admin/services/route";
import { PUT as saveCounters } from "@/app/api/queues/[id]/admin/counters/route";
import { PUT as saveSettings } from "@/app/api/queues/[id]/admin/settings/route";
import { GET as stats } from "@/app/api/queues/[id]/admin/stats/route";
import { GET as exportCsv } from "@/app/api/queues/[id]/admin/export.csv/route";
import { POST as reset } from "@/app/api/queues/[id]/admin/reset/route";
import { DEFAULT_SETTINGS, defaultConfig } from "@/features/queue/admin";
import { PP_OFFSET_MS } from "@/features/shop-pulse/time";

process.env.SESSION_SECRET = "test-secret";

const pp = (h: number, min = 0) => Date.UTC(2026, 9, 28, h, min) - PP_OFFSET_MS;
// Only Date is faked: noon Phnom Penh whatever time the tests run; timers stay real for the SSE stream.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(pp(12));
});
afterAll(() => vi.useRealTimers());

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) }) as never;
const req = (method: string, body?: unknown, cookie?: string) =>
  new Request("https://demo.raevori.com/api", { method, headers: cookie ? { cookie } : {}, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const counter = (n: number, open = true) => ({ name: { en: `Counter ${n}`, km: `បញ្ជរ ${n}` }, open });

let ipSeq = 0;
async function newQueue() {
  const res = await createQueue(new Request("http://x/api/queues", { method: "POST", headers: { "cf-connecting-ip": `10.8.0.${++ipSeq}` } }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; pin: string };
}
async function admin() {
  const q = await newQueue();
  const res = await login(req("POST", { pin: q.pin }), ctx({ id: q.id }));
  expect(res.status).toBe(204);
  return { ...q, cookie: res.headers.get("set-cookie")!.split(";")[0] };
}
const wrongPin = (pin: string) => (pin === "0000" ? "1111" : "0000");

describe("PIN and snapshots", () => {
  test("the creator gets the PIN; the snapshot and the event stream carry the config but never the PIN", async () => {
    const { id, pin } = await newQueue();
    expect(pin).toMatch(/^\d{4}$/);
    const snap = await (await getQueue(req("GET"), ctx({ id }))).json();
    expect(snap).toEqual({ tickets: expect.any(Array), ...defaultConfig() });
    const abort = new AbortController();
    const res = await events(new Request("http://x", { signal: abort.signal }), ctx({ id }));
    const { value } = await res.body!.getReader().read();
    const text = new TextDecoder().decode(value);
    abort.abort();
    expect(JSON.parse(text.match(/data: (.*)\n\n/)![1])).toEqual({ type: "snapshot", tickets: expect.any(Array), ...defaultConfig() });
    expect(JSON.stringify(snap) + text).not.toContain(`"pin"`);
  });

  test("login sets an HttpOnly, SameSite=Lax, Secure cookie scoped to the queue's admin for 2 hours", async () => {
    const { id, pin } = await newQueue();
    const res = await login(req("POST", { pin }), ctx({ id }));
    expect(res.status).toBe(204);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/^rq_admin=[^;]+/);
    expect(set).toContain(`Path=/api/queues/${id}/admin`);
    expect(set).toContain("Max-Age=7200");
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Secure/);
    const cookie = set.split(";")[0];
    expect((await session(req("GET", undefined, cookie), ctx({ id }))).status).toBe(204);
    expect((await session(req("GET"), ctx({ id }))).status).toBe(401);
    expect((await session(req("GET", undefined, cookie), ctx({ id: "nope" }))).status).toBe(404);
  });

  test("a wrong PIN is 401; the 6th wrong PIN in 10 minutes is 429, and so is the right one after it", async () => {
    const { id, pin } = await newQueue();
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

  test("the café's admin cookie doesn't open a queue's admin", async () => {
    const { id } = await newQueue();
    const { sign } = await import("@/lib/signed-cookie");
    const cafe = `ra_admin=${sign(`${id}:${Date.now() + 60_000}`, "table-order-admin")}`;
    const forged = `rq_admin=${sign(`${id}:${Date.now() + 60_000}`, "table-order-admin")}`;
    expect((await session(req("GET", undefined, cafe), ctx({ id }))).status).toBe(401);
    expect((await session(req("GET", undefined, forged), ctx({ id }))).status).toBe(401);
  });
});

describe("admin routes need the queue's cookie", () => {
  const calls = (id: string, cookie?: string) => [
    editService(req("PUT", { service: { id: "repair", minutes: 4 } }, cookie), ctx({ id })),
    addService(req("POST", { service: { name: { en: "Trade-in", km: "ប្តូរ" }, prefix: "T" } }, cookie), ctx({ id })),
    saveCounters(req("PUT", { counters: [counter(1), counter(2)] }, cookie), ctx({ id })),
    saveSettings(req("PUT", DEFAULT_SETTINGS, cookie), ctx({ id })),
    stats(req("GET", undefined, cookie), ctx({ id })),
    exportCsv(req("GET", undefined, cookie), ctx({ id })),
    reset(req("POST", undefined, cookie), ctx({ id })),
  ];

  test("401 without the cookie, 401 with a forged or another queue's cookie, 404 for an unknown queue", async () => {
    const a = await admin();
    const b = await admin();
    for (const res of await Promise.all(calls(a.id))) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "login" });
    }
    for (const res of await Promise.all(calls(a.id, b.cookie))) expect(res.status).toBe(401);
    const forged = a.cookie.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
    for (const res of await Promise.all(calls(a.id, forged))) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls("nope", a.cookie))) expect(res.status).toBe(404);
    // Nothing changed in queue A.
    const snap = await (await getQueue(req("GET"), ctx({ id: a.id }))).json();
    expect(snap).toMatchObject(defaultConfig());
  });

  test("with the cookie, each route works", async () => {
    const { id, cookie } = await admin();
    const statuses = [];
    for (const c of calls(id, cookie)) statuses.push((await c).status);
    expect(statuses).toEqual([200, 201, 200, 200, 200, 200, 200]);
  });
});

describe("services, counters and settings", () => {
  test("PUT edits a service, POST adds one with a server id and the next number uses its prefix", async () => {
    const { id, cookie } = await admin();
    const edited = await editService(req("PUT", { service: { id: "repair", prefix: "F", minutes: 8 } }, cookie), ctx({ id }));
    expect(await edited.json()).toMatchObject({ id: "repair", prefix: "F", minutes: 8 });
    expect(await (await take(req("POST", { service: "repair" }), ctx({ id }))).json()).toMatchObject({ number: "F-001" });

    const added = await addService(req("POST", { service: { id: "hack", name: { en: "Trade-in", km: "ប្តូរ" }, prefix: "T", minutes: 5 } }, cookie), ctx({ id }));
    expect(added.status).toBe(201);
    const service = await added.json();
    expect(service.id).not.toBe("hack");
    const snap = await (await getQueue(req("GET"), ctx({ id }))).json();
    expect(snap.services.at(-1)).toEqual(service);
    expect(await (await take(req("POST", { service: service.id }), ctx({ id }))).json()).toMatchObject({ number: "T-001", service: service.id });
  });

  test("a hidden service is 409 hidden; an unknown one is 400 bad_service", async () => {
    const { id, cookie } = await admin();
    await editService(req("PUT", { service: { id: "pickup", hidden: true } }, cookie), ctx({ id }));
    const res = await take(req("POST", { service: "pickup" }), ctx({ id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "hidden" });
    const unknown = await take(req("POST", { service: "haircut" }), ctx({ id }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "bad_service" });
  });

  test("a taken prefix is 409 prefix_taken; the 7th service is 409 too_many_services; an unknown service is 404", async () => {
    const { id, cookie } = await admin();
    const taken = await editService(req("PUT", { service: { id: "repair", prefix: "P" } }, cookie), ctx({ id }));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "prefix_taken" });
    for (const p of ["D", "E", "F"]) expect((await addService(req("POST", { service: { name: { en: p, km: p }, prefix: p } }, cookie), ctx({ id }))).status).toBe(201);
    const seventh = await addService(req("POST", { service: { name: { en: "G", km: "G" }, prefix: "G" } }, cookie), ctx({ id }));
    expect(seventh.status).toBe(409);
    expect(await seventh.json()).toEqual({ error: "too_many_services" });
    expect((await editService(req("PUT", { service: { id: "nope", minutes: 3 } }, cookie), ctx({ id }))).status).toBe(404);
  });

  test("counters: a closed one is 409 counter_closed, counters 3 and 4 call once added, counter 5 is 400", async () => {
    const { id, cookie } = await admin();
    const res = await saveCounters(req("PUT", { counters: [counter(1), counter(2, false), counter(3), counter(4)] }, cookie), ctx({ id }));
    expect(res.status).toBe(200);
    expect((await res.json()).map((c: { id: number; open: boolean }) => [c.id, c.open])).toEqual([[1, true], [2, false], [3, true], [4, true]]);
    const closed = await call(req("POST", { counter: 2 }), ctx({ id }));
    expect(closed.status).toBe(409);
    expect(await closed.json()).toEqual({ error: "counter_closed" });
    expect(await (await call(req("POST", { counter: 4 }), ctx({ id }))).json()).toMatchObject({ called: { counter: 4 } });
    expect(await (await call(req("POST", { counter: 3 }), ctx({ id }))).json()).toMatchObject({ called: { counter: 3 } });
    expect((await call(req("POST", { counter: 5 }), ctx({ id }))).status).toBe(400);
  });

  test("settings are stored and sent back", async () => {
    const { id, cookie } = await admin();
    const res = await saveSettings(req("PUT", { name: " Dara Mobile ", autoCall: 60 }, cookie), ctx({ id }));
    expect(await res.json()).toEqual({ name: "Dara Mobile", autoCall: 60 });
    expect((await (await getQueue(req("GET"), ctx({ id }))).json()).settings).toEqual({ name: "Dara Mobile", autoCall: 60 });
  });

  test.each([
    ["bad JSON", "service", "{x"],
    ["missing service", "service", {}],
    ["two-letter prefix", "service", { service: { id: "repair", prefix: "RR" } }],
    ["31 minutes", "service", { service: { id: "repair", minutes: 31 } }],
    ["new service without a prefix", "add", { service: { name: { en: "x", km: "x" } } }],
    ["no counters", "counters", { counters: [] }],
    ["5 counters", "counters", { counters: [1, 2, 3, 4, 5].map((n) => counter(n)) }],
    ["counters not a list", "counters", { counters: "2" }],
    ["auto-call 30 s", "settings", { name: "x", autoCall: 30 }],
    ["empty shop name", "settings", { name: " ", autoCall: 20 }],
  ])("%s is a 400", async (_name, route, body) => {
    const { id, cookie } = await admin();
    const res =
      route === "service" ? await editService(req("PUT", body, cookie), ctx({ id }))
      : route === "add" ? await addService(req("POST", body, cookie), ctx({ id }))
      : route === "counters" ? await saveCounters(req("PUT", body, cookie), ctx({ id }))
      : await saveSettings(req("PUT", body, cookie), ctx({ id }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(["invalid", "bad_json"]).toContain(json.error);
  });

  test("reset restores the default config and keeps the tickets and the PIN", async () => {
    const { id, pin, cookie } = await admin();
    await editService(req("PUT", { service: { id: "repair", prefix: "X" } }, cookie), ctx({ id }));
    await saveSettings(req("PUT", { name: "Dara", autoCall: 0 }, cookie), ctx({ id }));
    await take(req("POST", { service: "payment" }), ctx({ id }));
    const res = await reset(req("POST", undefined, cookie), ctx({ id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ tickets: expect.any(Array), ...defaultConfig() });
    expect(body.tickets).toHaveLength(7);
    expect(JSON.stringify(body)).not.toContain(`"pin"`);
    expect((await login(req("POST", { pin }), ctx({ id }))).status).toBe(204);
  });
});

describe("stats and CSV export", () => {
  test("stats count today's served and left tickets with their waits", async () => {
    const { id, cookie } = await admin();
    vi.setSystemTime(pp(12, 10));
    try {
      await call(req("POST", { counter: 1 }), ctx({ id }));
      const res = await stats(req("GET", undefined, cookie), ctx({ id }));
      expect(res.headers.get("cache-control")).toBe("no-store");
      // Seeded: R-012 waited 10 min (done now), R-011 10 min, P-007 called after 20 min.
      expect(await res.json()).toEqual({ day: "2026-10-28", served: 1, left: 0, avgWait: 13, longestWait: 20 });
    } finally {
      vi.setSystemTime(pp(12));
    }
  });

  test("is UTF-8 CSV with a BOM, a header and escaped service names", async () => {
    const { id, cookie } = await admin();
    await editService(req("PUT", { service: { id: "pickup", name: { en: 'Pick up, "fast"', km: "មកយក" } } }, cookie), ctx({ id }));
    const res = await exportCsv(req("GET", undefined, cookie), ctx({ id }));
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="tickets-2026-10-28.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n");
    expect(rows[0]).toBe("date,number,service,taken at,called at,counter,wait (min),status");
    expect(rows).toHaveLength(7);
    expect(rows[1]).toBe("2026-10-28,R-011,Repair,11:44,11:54,2,10,called");
    expect(rows[3]).toBe('2026-10-28,P-007,"Pick up, ""fast""",11:50,,,,waiting');
    const km = await (await exportCsv(new Request("https://demo.raevori.com/api?lang=km", { headers: { cookie } }), ctx({ id }))).text();
    expect(km).toContain(",ជួសជុល,");
  });
});
