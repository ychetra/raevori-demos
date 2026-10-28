import { afterEach, describe, expect, test } from "vitest";
import { callNext, takeTicket } from "@/features/queue/api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const answer = (status: number, body: unknown) => {
  globalThis.fetch = (async () => Response.json(body, { status })) as typeof fetch;
};
const offline = () => {
  globalThis.fetch = (async () => {
    throw new TypeError("offline");
  }) as typeof fetch;
};

describe("takeTicket", () => {
  test("a 201 answer maps to ok with the ticket", async () => {
    const ticket = { id: "abc", room: "q", number: "R-015", service: "repair", status: "waiting", at: { waiting: 1 } };
    answer(201, ticket);
    expect(await takeTicket("q", "repair")).toEqual({ ok: true, ticket });
  });

  test.each([
    [429, "full"],
    [404, "not_found"],
    [400, "failed"],
    [500, "failed"],
  ])("a %s answer maps to %s", async (status, error) => {
    answer(status, { error: "x" });
    expect(await takeTicket("q", "repair")).toEqual({ ok: false, error });
  });

  test("a network failure maps to failed", async () => {
    offline();
    expect(await takeTicket("q", "repair")).toEqual({ ok: false, error: "failed" });
  });
});

describe("callNext", () => {
  test("returns what the call changed, or null when it failed", async () => {
    answer(200, { done: null, called: null });
    expect(await callNext("q", 1)).toEqual({ done: null, called: null });
    answer(404, { error: "not_found" });
    expect(await callNext("q", 1)).toBeNull();
    offline();
    expect(await callNext("q", 1)).toBeNull();
  });

  test("sends auto: true only for the board's auto-call", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ done: null, called: null });
    }) as typeof fetch;
    await callNext("q", 2);
    await callNext("q", 1, { auto: true });
    expect(bodies).toEqual([{ counter: 2 }, { counter: 1, auto: true }]);
  });
});
