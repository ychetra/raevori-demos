import { afterEach, describe, expect, test, vi } from "vitest";
import { POST as createQueue } from "@/app/api/queues/route";
import { GET as getQueue } from "@/app/api/queues/[id]/route";
import { POST as take } from "@/app/api/queues/[id]/tickets/route";
import { POST as leave } from "@/app/api/queues/[id]/tickets/[tid]/leave/route";
import { POST as call } from "@/app/api/queues/[id]/call/route";
import { POST as recall } from "@/app/api/queues/[id]/recall/route";
import { GET as events } from "@/app/api/queues/[id]/events/route";
import { store } from "@/features/queue/server";
import type { Ticket } from "@/features/queue/types";

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) }) as never;
const json = (body: unknown) => new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const post = () => new Request("http://x/api", { method: "POST" });

let ipSeq = 0;
const queueReq = (ip?: string) => new Request("http://x/api/queues", { method: "POST", headers: ip === undefined ? { "cf-connecting-ip": `10.2.0.${++ipSeq}` } : ip ? { "cf-connecting-ip": ip } : {} });

async function newQueue() {
  const res = await createQueue(queueReq());
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
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

describe("queues API", () => {
  test("creates a queue and returns its snapshot", async () => {
    const id = await newQueue();
    const res = await getQueue(new Request("http://x"), ctx({ id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { tickets } = (await res.json()) as { tickets: Ticket[] };
    expect(tickets.map((t) => t.status)).toEqual(["called", "called", "waiting", "waiting", "waiting", "waiting"]);
  });

  test("one IP gets 20 queues an hour; the 21st is 429 too_many_rooms, another IP still gets one", async () => {
    for (let i = 0; i < 20; i++) expect((await createQueue(queueReq("203.0.113.19"))).status).toBe(201);
    const res = await createQueue(queueReq("203.0.113.19"));
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "too_many_rooms" });
    expect((await createQueue(queueReq("203.0.113.20"))).status).toBe(201);
  });

  test("requests with no proxy IP are not limited", async () => {
    for (let i = 0; i < 25; i++) expect((await createQueue(queueReq(""))).status).toBe(201);
  });

  test("unknown queue is 404 not_found everywhere", async () => {
    const id = "doesnotexist";
    const res = await getQueue(new Request("http://x"), ctx({ id }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect((await take(json({ service: "repair" }), ctx({ id }))).status).toBe(404);
    expect((await call(json({ counter: 1 }), ctx({ id }))).status).toBe(404);
    expect((await recall(json({ counter: 1 }), ctx({ id }))).status).toBe(404);
    expect((await leave(post(), ctx({ id, tid: "x" }))).status).toBe(404);
    expect((await events(new Request("http://x"), ctx({ id }))).status).toBe(404);
  });

  test("taking a number is a 201 with the new waiting ticket", async () => {
    const id = await newQueue();
    const res = await take(json({ service: "pickup" }), ctx({ id }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ room: id, number: "P-008", service: "pickup", status: "waiting" });
  });

  test.each([
    ["bad JSON", "{not json"],
    ["no service", {}],
    ["unknown service", { service: "haircut" }],
    ["service not a string", { service: 1 }],
    ["inherited key", { service: "toString" }],
  ])("taking with %s is a 400", async (_name, body) => {
    const id = await newQueue();
    expect((await take(json(body), ctx({ id }))).status).toBe(400);
  });

  test.each([
    ["bad JSON", "{not json"],
    ["no counter", {}],
    ["counter 0", { counter: 0 }],
    ["counter 3", { counter: 3 }],
    ["counter as text", { counter: "1" }],
  ])("call and recall with %s are a 400", async (_name, body) => {
    const id = await newQueue();
    expect((await call(json(body), ctx({ id }))).status).toBe(400);
    expect((await recall(json(body), ctx({ id }))).status).toBe(400);
  });

  test("a full queue answers 429 full", async () => {
    const id = await newQueue();
    for (let i = 0; i < 60; i++) await take(json({ service: "repair" }), ctx({ id }));
    const res = await take(json({ service: "repair" }), ctx({ id }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "full" });
  });

  test("call answers what it finished and what it called", async () => {
    const id = await newQueue();
    const res = await call(json({ counter: 2 }), ctx({ id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ done: { number: "R-011", status: "done" }, called: { number: "P-007", status: "called", counter: 2 } });
  });

  test("an auto call tops the line up to 3 waiting; a manual call doesn't", async () => {
    const waiting = (id: string) => store.get(id)!.tickets.filter((t) => t.status === "waiting").length;
    const auto = await newQueue();
    for (let i = 0; i < 5; i++) expect((await call(json({ counter: 1, auto: true }), ctx({ id: auto }))).status).toBe(200);
    expect(waiting(auto)).toBe(3);
    const manual = await newQueue();
    for (let i = 0; i < 5; i++) expect((await call(json({ counter: 1 }), ctx({ id: manual }))).status).toBe(200);
    expect(waiting(manual)).toBe(0);
    const notTrue = await newQueue();
    for (let i = 0; i < 5; i++) await call(json({ counter: 1, auto: "yes" }), ctx({ id: notTrue }));
    expect(waiting(notTrue)).toBe(0);
  });

  test("recall answers the counter's current ticket, or null when idle", async () => {
    const id = await newQueue();
    const res = await recall(json({ counter: 1 }), ctx({ id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ticket: { number: "R-012", status: "called", counter: 1 } });
    for (let i = 0; i < 5; i++) await call(json({ counter: 1 }), ctx({ id }));
    expect(await (await recall(json({ counter: 1 }), ctx({ id }))).json()).toEqual({ ticket: null });
  });

  test("leave moves a ticket to left and 404s an unknown one", async () => {
    const id = await newQueue();
    const t = (await (await take(json({ service: "payment" }), ctx({ id }))).json()) as Ticket;
    const res = await leave(post(), ctx({ id, tid: t.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: t.id, status: "left" });
    expect((await leave(post(), ctx({ id, tid: "nope" }))).status).toBe(404);
  });

  test("events stream starts with a snapshot, then pushes ticket changes", async () => {
    const id = await newQueue();
    const abort = new AbortController();
    const res = await events(new Request("http://x", { signal: abort.signal }), ctx({ id }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    const first = await readEvent(reader);
    expect(first.type).toBe("snapshot");
    expect(first.tickets).toHaveLength(6);
    await take(json({ service: "repair" }), ctx({ id }));
    expect(await readEvent(reader)).toMatchObject({ type: "ticket", ticket: { number: "R-015", status: "waiting" } });
    abort.abort();
  });

  describe("with a fake clock", () => {
    afterEach(() => vi.useRealTimers());

    test("events stream pings every 20 s and sends closed once the queue has expired", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      const id = await newQueue();
      const res = await events(new Request("http://x"), ctx({ id }));
      const reader = res.body!.getReader();
      expect((await readEvent(reader)).type).toBe("snapshot");
      vi.advanceTimersByTime(20_000);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(": ping\n\n");
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000 + 1);
      store.sweep();
      vi.advanceTimersByTime(20_000);
      expect(await readEvent(reader)).toEqual({ type: "closed" });
      expect((await reader.read()).done).toBe(true);
    });
  });
});
