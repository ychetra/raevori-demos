import { afterEach, describe, expect, test } from "vitest";
import { holdSlot, payHold, setBookingStatus } from "@/features/booking/api";
import type { HoldInput } from "@/features/booking/types";

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

const input: HoldInput = { service: "haircut", stylist: "any", start: 1, name: "Sophea" };
const booking = { id: "abc", room: "r", service: "haircut", stylist: "bopha", start: 1, end: 2, name: "Sophea", status: "held", holdUntil: 3, at: { held: 0 } };

describe("holdSlot", () => {
  test("a 201 answer maps to ok with the booking", async () => {
    answer(201, booking);
    expect(await holdSlot("r", input)).toEqual({ ok: true, booking });
  });

  test.each([
    [409, "taken"],
    [429, "full"],
    [404, "not_found"],
    [400, "invalid"],
    [500, "failed"],
  ])("a %s answer maps to %s", async (status, error) => {
    answer(status, { error: "x" });
    expect(await holdSlot("r", input)).toEqual({ ok: false, error });
  });

  test("a network failure maps to failed", async () => {
    offline();
    expect(await holdSlot("r", input)).toEqual({ ok: false, error: "failed" });
  });
});

describe("payHold", () => {
  test.each<[number, unknown]>([
    [200, { ok: true, booking: { ...booking, status: "booked" } }],
    [410, { ok: false, error: "expired" }],
    [404, { ok: false, error: "not_found" }],
    [500, { ok: false, error: "failed" }],
  ])("a %s answer maps to %j", async (status, result) => {
    answer(status, status === 200 ? { ...booking, status: "booked" } : { error: "x" });
    expect(await payHold("r", "abc")).toEqual(result);
  });

  test("a network failure maps to failed", async () => {
    offline();
    expect(await payHold("r", "abc")).toEqual({ ok: false, error: "failed" });
  });
});

describe("setBookingStatus", () => {
  test("returns the booking, or null when it failed", async () => {
    answer(200, { ...booking, status: "arrived" });
    expect(await setBookingStatus("r", "abc", "arrived")).toMatchObject({ status: "arrived" });
    answer(409, { error: "wrong_state" });
    expect(await setBookingStatus("r", "abc", "arrived")).toBeNull();
    offline();
    expect(await setBookingStatus("r", "abc", "noshow")).toBeNull();
  });
});
