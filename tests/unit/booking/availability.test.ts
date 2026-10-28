import { describe, expect, test } from "vitest";
import { availability, blocks, freeStylist, isFree, slotStarts } from "@/features/booking/availability";
import { durationMs } from "@/features/booking/salon";
import type { Booking, BookingStatus, ServiceId, StylistId } from "@/features/booking/types";

const H = 60 * 60 * 1000;
const M = 60 * 1000;
/** 2026-10-28 00:00 Phnom Penh (= 2026-10-27 17:00 UTC). */
const D = Date.UTC(2026, 9, 28) - 7 * H;
const at = (h: number, m = 0, day = D) => day + h * H + m * M;
/** Before the day opens, so nothing is in the past. */
const EARLY = at(6);

let seq = 0;
const b = (stylist: StylistId, start: number, service: ServiceId, status: BookingStatus = "booked", holdUntil?: number): Booking => ({
  id: `b${++seq}`,
  room: "r",
  service,
  stylist,
  start,
  end: start + durationMs(service),
  name: "Sophea",
  price: 8,
  deposit: 3,
  status,
  ...(holdUntil !== undefined && { holdUntil }),
  at: {},
});
/** "10:30" labels in Phnom Penh time. */
const hhmm = (ms: number) => new Date(ms + 7 * H).toISOString().slice(11, 16);

describe("slot grid", () => {
  test("30-minute starts from 09:00 to 18:30 Phnom Penh", () => {
    const s = slotStarts(D);
    expect(s).toHaveLength(20);
    expect(hhmm(s[0])).toBe("09:00");
    expect(hhmm(s.at(-1)!)).toBe("18:30");
    expect(s[0]).toBe(Date.UTC(2026, 9, 28, 2)); // 09:00 PP is 02:00 UTC
  });
});

describe("availability", () => {
  test("an empty day offers every start whose service fits by 19:00", () => {
    expect(availability([], "haircut", "bopha", D, EARLY).map(hhmm)).toEqual(slotStarts(D).map(hhmm));
    expect(availability([], "manicure", "bopha", D, EARLY).map(hhmm).at(-1)).toBe("18:00");
  });

  test("a 90-minute colour fits at 17:30 but not at 18:00", () => {
    const free = availability([], "colour", "dara", D, EARLY).map(hhmm);
    expect(free).toHaveLength(18);
    expect(free.at(-1)).toBe("17:30");
    expect(free).not.toContain("18:00");
    expect(isFree([], "colour", "dara", at(17, 30), EARLY)).toBe(true);
    expect(isFree([], "colour", "dara", at(18), EARLY)).toBe(false);
  });

  test("a booking blocks overlapping starts on both edges, and touching ones stay free", () => {
    const busy = [b("bopha", at(11), "manicure")]; // 11:00-12:00
    const cut = availability(busy, "haircut", "bopha", D, EARLY).map(hhmm);
    expect(cut).toContain("10:30"); // ends exactly at 11:00
    expect(cut).not.toContain("11:00");
    expect(cut).not.toContain("11:30");
    expect(cut).toContain("12:00"); // starts exactly at 12:00
    const colour = availability(busy, "colour", "bopha", D, EARLY).map(hhmm);
    expect(colour).toContain("09:30"); // 09:30-11:00
    expect(colour).not.toContain("10:00"); // runs into 11:00
    expect(colour).not.toContain("10:30");
    expect(colour).not.toContain("11:30");
    expect(colour).toContain("12:00");
  });

  test("a booking only blocks its own stylist", () => {
    const busy = [b("bopha", at(11), "manicure")];
    expect(availability(busy, "haircut", "dara", D, EARLY)).toHaveLength(20);
  });

  test.each<[BookingStatus, boolean]>([
    ["booked", true],
    ["arrived", true],
    ["noshow", true],
    ["expired", false],
  ])("a %s booking blocks: %s", (status, blocked) => {
    const busy = [b("bopha", at(10), "haircut", status)];
    expect(isFree(busy, "haircut", "bopha", at(10), EARLY)).toBe(!blocked);
  });

  test("a hold blocks until holdUntil, then the slot is free again", () => {
    const holdUntil = at(8, 5);
    const busy = [b("srey-leak", at(10), "haircut", "held", holdUntil)];
    expect(blocks(busy[0], holdUntil - 1)).toBe(true);
    expect(availability(busy, "haircut", "srey-leak", D, holdUntil - 1).map(hhmm)).not.toContain("10:00");
    expect(blocks(busy[0], holdUntil)).toBe(false);
    expect(availability(busy, "haircut", "srey-leak", D, holdUntil).map(hhmm)).toContain("10:00");
  });

  test("nothing in the past: starts must be strictly after now, rounded up to the next slot", () => {
    expect(availability([], "haircut", "bopha", D, at(10, 5)).map(hhmm)[0]).toBe("10:30");
    expect(availability([], "haircut", "bopha", D, at(10)).map(hhmm)[0]).toBe("10:30");
    expect(availability([], "haircut", "bopha", D, at(10) - 1).map(hhmm)[0]).toBe("10:00");
    expect(availability([], "haircut", "bopha", D, at(18, 31))).toEqual([]);
    expect(isFree([], "haircut", "bopha", at(10), at(10))).toBe(false);
  });

  test("a day that has passed has nothing; the next day is whole", () => {
    expect(availability([], "haircut", "bopha", D - 24 * H, EARLY)).toEqual([]);
    expect(availability([], "haircut", "bopha", D + 24 * H, at(18, 59))).toHaveLength(20);
  });

  test("the UTC+7 day boundary: at 23:30 Phnom Penh 'today' is over and tomorrow is open", () => {
    const now = at(23, 30, D - 24 * H); // 2026-10-27 23:30 PP, still the 27th in UTC too (16:30Z)
    expect(availability([], "haircut", "bopha", D - 24 * H, now)).toEqual([]);
    const tomorrow = availability([], "haircut", "bopha", D, now);
    expect(tomorrow).toHaveLength(20);
    expect(tomorrow[0]).toBe(at(9));
  });

  test("any instant within the day picks that Phnom Penh day", () => {
    // 2026-10-28 00:00 UTC is 07:00 PP on the 28th, and 2026-10-28 20:00 UTC is already the 29th in PP.
    expect(availability([], "haircut", "bopha", Date.UTC(2026, 9, 28), EARLY)[0]).toBe(at(9));
    expect(availability([], "haircut", "bopha", Date.UTC(2026, 9, 28, 20), EARLY)[0]).toBe(at(9, 0, D + 24 * H));
  });

  test("off-grid and out-of-hours starts are never free", () => {
    expect(isFree([], "haircut", "bopha", at(10, 15), EARLY)).toBe(false);
    expect(isFree([], "haircut", "bopha", at(8, 30), EARLY)).toBe(false);
    expect(isFree([], "haircut", "bopha", at(19), EARLY)).toBe(false);
    expect(isFree([], "haircut", "bopha", at(18, 30), EARLY)).toBe(true);
  });
});

describe("anyone", () => {
  test("a start is free when at least one stylist is free", () => {
    const busy = [b("bopha", at(10), "haircut"), b("dara", at(10), "haircut")];
    expect(availability(busy, "haircut", "any", D, EARLY).map(hhmm)).toContain("10:00");
    const all = [...busy, b("srey-leak", at(9, 30), "manicure")];
    expect(availability(all, "haircut", "any", D, EARLY).map(hhmm)).not.toContain("10:00");
    expect(availability(all, "haircut", "any", D, EARLY).map(hhmm)).toContain("10:30");
  });

  test("anyone gets the first free stylist in roster order", () => {
    expect(freeStylist([], "haircut", at(10), EARLY)).toBe("bopha");
    expect(freeStylist([b("bopha", at(10), "haircut")], "haircut", at(10), EARLY)).toBe("dara");
    expect(freeStylist([b("bopha", at(10), "haircut"), b("dara", at(9), "colour")], "haircut", at(10), EARLY)).toBe("srey-leak");
    const all = [b("bopha", at(10), "haircut"), b("dara", at(10), "haircut"), b("srey-leak", at(10), "haircut")];
    expect(freeStylist(all, "haircut", at(10), EARLY)).toBeNull();
  });
});
