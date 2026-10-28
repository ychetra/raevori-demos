import { afterEach, describe, expect, test } from "vitest";
import { addService, adminLogin, adminSession, exportUrl, fetchStats, resetQueue, saveCounters, saveSettings, updateService } from "@/features/queue/admin-api";
import { createQueue, takeTicket } from "@/features/queue/api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

let seen: { url: string; init?: RequestInit }[] = [];
const answer = (status: number, body?: unknown) => {
  seen = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return body === undefined ? new Response(null, { status }) : Response.json(body, { status });
  }) as typeof fetch;
};
const sent = () => JSON.parse(seen[0].init!.body as string);

describe("queue admin client", () => {
  test("login maps 204, 401, 429 and 404", async () => {
    answer(204);
    expect(await adminLogin("q 1", "4821")).toEqual({ ok: true });
    expect(seen[0].url).toBe("/api/queues/q%201/admin/login");
    expect(sent()).toEqual({ pin: "4821" });
    answer(401, { error: "wrong_pin" });
    expect(await adminLogin("q", "1")).toEqual({ ok: false, error: "wrong_pin" });
    answer(429, { error: "too_many_tries" });
    expect(await adminLogin("q", "1")).toEqual({ ok: false, error: "too_many_tries" });
    answer(404, { error: "not_found" });
    expect(await adminLogin("q", "1")).toEqual({ ok: false, error: "not_found" });
  });

  test("session maps 204, 401 and 404", async () => {
    answer(204);
    expect(await adminSession("q")).toBe("in");
    answer(401, { error: "login" });
    expect(await adminSession("q")).toBe("out");
    answer(404, { error: "not_found" });
    expect(await adminSession("q")).toBe("not_found");
  });

  test("services, counters and settings send the right requests and map errors", async () => {
    answer(200, { id: "repair", prefix: "F" });
    expect(await updateService("q", { id: "repair", prefix: "F" })).toEqual({ ok: true, value: { id: "repair", prefix: "F" } });
    expect(seen[0]).toMatchObject({ url: "/api/queues/q/admin/services", init: { method: "PUT" } });
    expect(sent()).toEqual({ service: { id: "repair", prefix: "F" } });

    answer(409, { error: "prefix_taken" });
    expect(await addService("q", { name: { en: "x", km: "x" }, prefix: "P" })).toEqual({ ok: false, status: 409, error: "prefix_taken" });
    expect(seen[0]).toMatchObject({ url: "/api/queues/q/admin/services", init: { method: "POST" } });

    answer(200, []);
    await saveCounters("q", [{ name: { en: "Window A", km: "A" }, open: false }]);
    expect(seen[0]).toMatchObject({ url: "/api/queues/q/admin/counters", init: { method: "PUT" } });
    expect(sent()).toEqual({ counters: [{ name: { en: "Window A", km: "A" }, open: false }] });

    answer(400, { error: "invalid", field: "autoCall" });
    expect(await saveSettings("q", { name: "x", autoCall: 30 as never })).toEqual({ ok: false, status: 400, error: "invalid", field: "autoCall" });
    expect(sent()).toEqual({ name: "x", autoCall: 30 });
  });

  test("stats, reset and the export link", async () => {
    answer(200, { day: "2026-10-28", served: 1, left: 0, avgWait: 4, longestWait: 4 });
    expect(await fetchStats("q")).toEqual({ ok: true, value: { day: "2026-10-28", served: 1, left: 0, avgWait: 4, longestWait: 4 } });
    expect(seen[0]).toMatchObject({ url: "/api/queues/q/admin/stats", init: { method: "GET" } });
    answer(401, { error: "login" });
    expect(await resetQueue("q")).toEqual({ ok: false, status: 401, error: "login" });
    expect(seen[0]).toMatchObject({ url: "/api/queues/q/admin/reset", init: { method: "POST" } });
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await fetchStats("q")).toEqual({ ok: false, status: 0, error: "failed" });
    expect(exportUrl("q", "km")).toBe("/api/queues/q/admin/export.csv?lang=km");
  });

  test("createQueue returns the id and the PIN; takeTicket maps 409 hidden", async () => {
    answer(201, { id: "q", pin: "4821" });
    expect(await createQueue()).toEqual({ id: "q", pin: "4821" });
    answer(409, { error: "hidden" });
    expect(await takeTicket("q", "pickup")).toEqual({ ok: false, error: "hidden" });
  });
});
