import { afterEach, describe, expect, test } from "vitest";
import { adminLogin, adminSession, cancelOrder, exportUrl, updateItem } from "@/features/table-order/admin-api";
import { placeOrder } from "@/features/table-order/api";

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
const latte = [{ itemId: "iced-latte", qty: 1, options: {} }];

describe("admin client", () => {
  test("login maps 204, 401, 429 and 404", async () => {
    answer(204);
    expect(await adminLogin("r 1", "4821")).toEqual({ ok: true });
    expect(seen[0].url).toBe("/api/rooms/r%201/admin/login");
    expect(JSON.parse(seen[0].init!.body as string)).toEqual({ pin: "4821" });
    answer(401, { error: "wrong_pin" });
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "wrong_pin" });
    answer(429, { error: "too_many_tries" });
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "too_many_tries" });
    answer(404, { error: "not_found" });
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "not_found" });
  });

  test("session, item edits and cancels send the right requests and map errors", async () => {
    answer(401, { error: "login" });
    expect(await adminSession("r")).toBe("out");
    answer(200, { id: "iced-latte", soldOut: true });
    expect(await updateItem("r", { id: "iced-latte", soldOut: true })).toEqual({ ok: true, value: { id: "iced-latte", soldOut: true } });
    expect(seen[0]).toMatchObject({ url: "/api/rooms/r/admin/menu", init: { method: "PUT" } });
    expect(JSON.parse(seen[0].init!.body as string)).toEqual({ item: { id: "iced-latte", soldOut: true } });
    answer(400, { error: "invalid", field: "reason" });
    expect(await cancelOrder("r", "A12", "")).toEqual({ ok: false, status: 400, error: "invalid", field: "reason" });
    expect(JSON.parse(seen[0].init!.body as string)).toEqual({ status: "cancelled", reason: "" });
    expect(exportUrl("r", "km")).toBe("/api/rooms/r/admin/export.csv?lang=km");
  });

  test("placeOrder sends expectedTotal and maps sold_out, closed and price_changed", async () => {
    answer(409, { error: "sold_out", itemId: "iced-latte" });
    expect(await placeOrder("r", 4, latte, 2.25)).toEqual({ ok: false, error: "sold_out", itemId: "iced-latte" });
    expect(JSON.parse(seen[0].init!.body as string)).toEqual({ table: 4, lines: latte, expectedTotal: 2.25 });
    answer(409, { error: "closed" });
    expect(await placeOrder("r", 4, latte)).toEqual({ ok: false, error: "closed" });
    expect(JSON.parse(seen[0].init!.body as string)).not.toHaveProperty("expectedTotal");
    answer(409, { error: "price_changed", total: 3 });
    expect(await placeOrder("r", 4, latte, 2.25)).toEqual({ ok: false, error: "price_changed", total: 3 });
    answer(400, { error: "bad_table" });
    expect(await placeOrder("r", 40, latte)).toEqual({ ok: false, error: "bad_table" });
  });
});
