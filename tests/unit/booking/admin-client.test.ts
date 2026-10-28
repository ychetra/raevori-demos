import { afterEach, describe, expect, test } from "vitest";
import {
  addStylist,
  adminLogin,
  adminSession,
  cancelBooking,
  exportUrl,
  moveBooking,
  resetSalon,
  saveSettings,
  updateService,
  updateStylist,
} from "@/features/booking/admin-api";
import { DEFAULT_SETTINGS } from "@/features/booking/salon";

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

describe("salon admin client", () => {
  test("login maps 204, 401, 429, 404 and a network failure", async () => {
    answer(204);
    expect(await adminLogin("r 1", "4821")).toEqual({ ok: true });
    expect(seen[0].url).toBe("/api/bookings/r%201/admin/login");
    expect(sent()).toEqual({ pin: "4821" });
    answer(401, { error: "wrong_pin" });
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "wrong_pin" });
    answer(429, { error: "too_many_tries" });
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "too_many_tries" });
    answer(404, { error: "not_found" });
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "not_found" });
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await adminLogin("r", "1")).toEqual({ ok: false, error: "failed" });
  });

  test("session", async () => {
    answer(204);
    expect(await adminSession("r")).toBe("in");
    answer(401, { error: "login" });
    expect(await adminSession("r")).toBe("out");
    answer(404, { error: "not_found" });
    expect(await adminSession("r")).toBe("not_found");
  });

  test("config edits send the right requests", async () => {
    answer(200, { id: "haircut", minutes: 60, price: 9 });
    expect(await updateService("r", { id: "haircut", minutes: 60, price: 9 })).toEqual({ ok: true, value: { id: "haircut", minutes: 60, price: 9 } });
    expect(seen[0]).toMatchObject({ url: "/api/bookings/r/admin/services", init: { method: "PUT" } });
    expect(sent()).toEqual({ service: { id: "haircut", minutes: 60, price: 9 } });

    answer(200, {});
    await updateStylist("r", { id: "dara", daysOff: [1] });
    expect(seen[0]).toMatchObject({ url: "/api/bookings/r/admin/stylists", init: { method: "PUT" } });
    expect(sent()).toEqual({ stylist: { id: "dara", daysOff: [1] } });

    answer(409, { error: "too_many_stylists" });
    expect(await addStylist("r", { name: { en: "Nita", km: "នីតា" } })).toEqual({ ok: false, status: 409, error: "too_many_stylists" });
    expect(seen[0]).toMatchObject({ url: "/api/bookings/r/admin/stylists", init: { method: "POST" } });
    expect(sent()).toEqual({ stylist: { name: { en: "Nita", km: "នីតា" } } });

    answer(400, { error: "invalid", field: "deposit" });
    expect(await saveSettings("r", { ...DEFAULT_SETTINGS, deposit: 11 })).toEqual({ ok: false, status: 400, error: "invalid", field: "deposit" });
    expect(seen[0]).toMatchObject({ url: "/api/bookings/r/admin/settings", init: { method: "PUT" } });
    expect(sent()).toEqual({ ...DEFAULT_SETTINGS, deposit: 11 });

    answer(200, {});
    await resetSalon("r");
    expect(seen[0]).toMatchObject({ url: "/api/bookings/r/admin/reset", init: { method: "POST" } });
  });

  test("cancel and move PATCH the booking; export is a link", async () => {
    answer(200, { id: "b/1", status: "cancelled" });
    expect(await cancelBooking("r", "b/1", "Sick", true)).toEqual({ ok: true, value: { id: "b/1", status: "cancelled" } });
    expect(seen[0]).toMatchObject({ url: "/api/bookings/r/admin/bookings/b%2F1", init: { method: "PATCH" } });
    expect(sent()).toEqual({ action: "cancel", reason: "Sick", refund: true });

    answer(409, { error: "taken" });
    expect(await moveBooking("r", "b1", 123, "dara")).toEqual({ ok: false, status: 409, error: "taken" });
    expect(sent()).toEqual({ action: "move", start: 123, stylist: "dara" });
    await moveBooking("r", "b1", 456);
    expect(sent()).toEqual({ action: "move", start: 123, stylist: "dara" });
    expect(JSON.parse(seen[1].init!.body as string)).toEqual({ action: "move", start: 456 });

    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await cancelBooking("r", "b1", "x", false)).toEqual({ ok: false, status: 0, error: "failed" });
    expect(exportUrl("r", "km")).toBe("/api/bookings/r/admin/export.csv?lang=km");
  });
});
