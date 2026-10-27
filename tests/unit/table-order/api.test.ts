import { describe, expect, test } from "vitest";
import { POST as createRoom } from "@/app/api/rooms/route";
import { GET as getRoom } from "@/app/api/rooms/[id]/route";
import { POST as postOrder } from "@/app/api/rooms/[id]/orders/route";
import { PATCH as advance } from "@/app/api/rooms/[id]/orders/[orderId]/route";
import { GET as events } from "@/app/api/rooms/[id]/events/route";

const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) }) as never;
const json = (body: unknown) => new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const latte = [{ itemId: "iced-latte", qty: 1, options: {} }];

async function newRoom() {
  const res = await createRoom();
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

describe("rooms API", () => {
  test("creates a room and returns its snapshot", async () => {
    const id = await newRoom();
    const res = await getRoom(new Request("http://x"), ctx({ id }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { orders: unknown[] }).orders).toHaveLength(2);
  });

  test("unknown room is 404 not_found", async () => {
    const res = await getRoom(new Request("http://x"), ctx({ id: "doesnotexist" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect((await postOrder(json({ table: 4, lines: latte }), ctx({ id: "doesnotexist" }))).status).toBe(404);
    expect((await events(new Request("http://x"), ctx({ id: "doesnotexist" }))).status).toBe(404);
  });

  test("the server's price wins over tampered client prices", async () => {
    const id = await newRoom();
    const res = await postOrder(json({ table: 4, total: 0.01, lines: [{ itemId: "iced-latte", qty: 2, options: { size: "large" }, unitPrice: 0.01 }] }), ctx({ id }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ total: 5.5, table: 4, status: "new" });
  });

  test.each([
    ["bad JSON", "{not json"],
    ["table 0", { table: 0, lines: latte }],
    ["table 51", { table: 51, lines: latte }],
    ["table 4.5", { table: 4.5, lines: latte }],
    ["unknown item", { table: 4, lines: [{ itemId: "nope", qty: 1, options: {} }] }],
    ["missing lines", { table: 4 }],
  ])("%s is a 400", async (_name, body) => {
    const id = await newRoom();
    const res = await postOrder(json(body), ctx({ id }));
    expect(res.status).toBe(400);
  });

  test("a full room answers 429", async () => {
    const id = await newRoom();
    for (let i = 0; i < 30; i++) await postOrder(json({ table: 4, lines: latte }), ctx({ id }));
    const res = await postOrder(json({ table: 4, lines: latte }), ctx({ id }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "full" });
  });

  test("PATCH advances an order and 404s an unknown one", async () => {
    const id = await newRoom();
    const order = (await (await postOrder(json({ table: 4, lines: latte }), ctx({ id }))).json()) as { id: string };
    const res = await advance(new Request("http://x", { method: "PATCH" }), ctx({ id, orderId: order.id }));
    expect(await res.json()).toMatchObject({ status: "preparing" });
    expect((await advance(new Request("http://x", { method: "PATCH" }), ctx({ id, orderId: "Z9" }))).status).toBe(404);
  });

  test("events stream starts with a snapshot, then pushes new orders", async () => {
    const id = await newRoom();
    const abort = new AbortController();
    const res = await events(new Request("http://x", { signal: abort.signal }), ctx({ id }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    const first = await readEvent(reader);
    expect(first.type).toBe("snapshot");
    expect(first.orders).toHaveLength(2);
    await postOrder(json({ table: 4, lines: latte }), ctx({ id }));
    const next = await readEvent(reader);
    expect(next).toMatchObject({ type: "order", order: { table: 4, status: "new" } });
    abort.abort();
  });
});
