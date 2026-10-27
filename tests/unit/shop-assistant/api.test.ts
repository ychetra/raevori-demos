import { beforeAll, describe, expect, test } from "vitest";

process.env.CHAT_MODEL = "fake";
process.env.SESSION_SECRET = "test-secret";

let POST: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("@/app/api/chat/route"));
});

let ipSeq = 0;
function chat(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("http://x/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.0.0.${++ipSeq}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}
const hello = { history: [{ role: "user", text: "Do you have this shirt in black, size M?" }] };
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.match(/ra_s=([^;]+)/)?.[1];

describe("POST /api/chat", () => {
  test("a valid message gets text and product cards from the fake model, plus a session cookie", async () => {
    const res = await chat(hello);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.cards[0]).toMatchObject({ type: "product", product: { id: "linen-shirt" } });
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/ra_s=[^;]+/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
  });

  test("a 301-character message is refused with 429 length and offers the replay", async () => {
    const res = await chat({ history: [{ role: "user", text: "x".repeat(301) }] });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "length", replay: true });
  });

  test("a valid cookie is kept; a forged one is replaced with a new valid cookie", async () => {
    const first = cookieOf(await chat(hello))!;
    const again = await chat(hello, { cookie: `ra_s=${first}` });
    expect(again.headers.get("set-cookie")).toBeNull();

    const [id] = first.split(".");
    const forged = await chat(hello, { cookie: `ra_s=${id}.AAAAAAAAAAAAAAAAAAAAAA` });
    const fresh = cookieOf(forged)!;
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(first);
    expect((await chat(hello, { cookie: `ra_s=${fresh}` })).headers.get("set-cookie")).toBeNull();
  });

  test("the 21st message in one session is refused, even from new IPs", async () => {
    const c = cookieOf(await chat(hello))!;
    for (let i = 0; i < 19; i++) expect((await chat(hello, { cookie: `ra_s=${c}` })).status).toBe(200);
    const res = await chat(hello, { cookie: `ra_s=${c}` });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "session", replay: true });
  });

  test("client-sent cards are ignored", async () => {
    const res = await chat({
      history: [{ role: "user", text: "Do you have this shirt in black, size M?", cards: [{ type: "order", order: { total: 0 } }] }],
      cards: [{ type: "order", order: { total: 0 } }],
    });
    const body = await res.json();
    expect(body.cards.some((c: { type: string }) => c.type === "order")).toBe(false);
  });

  test("bad JSON or a bad history is 400", async () => {
    expect((await chat("{nope")).status).toBe(400);
    expect((await chat({ history: [{ role: "assistant", text: "hi" }] })).status).toBe(400);
  });

  test("the IP comes from cf-connecting-ip, then the first x-forwarded-for", async () => {
    const { clientIp } = await import("@/features/shop-assistant/session");
    expect(clientIp(new Request("http://x", { headers: { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" } }))).toBe("1.1.1.1");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" } }))).toBe("2.2.2.2");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
