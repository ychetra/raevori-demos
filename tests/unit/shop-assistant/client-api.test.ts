import { afterEach, describe, expect, test } from "vitest";
import { sendChat } from "@/features/shop-assistant/api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const hi = [{ role: "user" as const, text: "hi" }];
const answer = (status: number, body: unknown) => {
  globalThis.fetch = (async () => Response.json(body, { status })) as typeof fetch;
};

describe("sendChat", () => {
  test("a stalled request gives up after the timeout and reports busy", async () => {
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason));
      })) as typeof fetch;
    const started = Date.now();
    expect(await sendChat(hi, { timeoutMs: 50 })).toEqual({ ok: false, error: "busy" });
    expect(Date.now() - started).toBeLessThan(500);
  }, 2000);

  test("a 503 busy answer maps to busy", async () => {
    answer(503, { error: "busy", replay: true });
    expect(await sendChat(hi)).toEqual({ ok: false, error: "busy" });
  });

  test("a 429 session answer maps to session", async () => {
    answer(429, { error: "session" });
    expect(await sendChat(hi)).toEqual({ ok: false, error: "session" });
  });

  test("a 200 answer maps to ok with text and cards", async () => {
    const cards = [{ type: "delivery", zone: "bkk1", fee: 1.5 }];
    answer(200, { text: "Yes, in stock.", cards });
    expect(await sendChat(hi)).toEqual({ ok: true, text: "Yes, in stock.", cards });
  });
});
