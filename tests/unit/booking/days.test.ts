import { describe, expect, it } from "vitest";
import { durationMs } from "@/features/booking/salon";
import type { Booking, BookingStatus, ServiceId, StylistId } from "@/features/booking/types";
import { dayToFollow, firstDayWithTimes } from "@/features/booking/ui/days";
import { bookingDays } from "@/features/booking/ui/format";

const H = 60 * 60 * 1000;
const DAY = 24 * H;
/** 2026-10-28 00:00 Phnom Penh. */
const D = Date.UTC(2026, 9, 28) - 7 * H;
const at = (h: number, m = 0, day = D) => day + h * H + m * 60_000;

let seq = 0;
const b = (stylist: StylistId, start: number, service: ServiceId = "haircut", status: BookingStatus = "booked", id = `b${++seq}`): Booking => ({
  id,
  room: "r",
  service,
  stylist,
  start,
  end: start + durationMs(service),
  name: "Sophea",
  status,
  at: {},
});
const seen = (bs: Booking[]) => new Map(bs.map((x) => [x.id, x.status]));
/** Every half hour 09:00-18:30 taken for `stylist` on `day`. */
const fullDay = (stylist: StylistId, day: number) => Array.from({ length: 20 }, (_, i) => b(stylist, at(9, i * 30, day)));

describe("firstDayWithTimes", () => {
  it("is today while today still has a free time", () => {
    const now = at(10);
    expect(firstDayWithTimes([], "haircut", "any", bookingDays(now), now)).toBe(0);
  });

  it("is tomorrow in the evening, after today's last start", () => {
    const now = at(18, 40);
    expect(firstDayWithTimes([], "haircut", "any", bookingDays(now), now)).toBe(1);
  });

  it("skips a day the chosen stylist is fully booked, but not for Anyone", () => {
    const now = at(18, 40);
    const days = bookingDays(now);
    const full = fullDay("bopha", days[1]);
    expect(firstDayWithTimes(full, "haircut", "bopha", days, now)).toBe(2);
    expect(firstDayWithTimes(full, "haircut", "any", days, now)).toBe(1);
  });

  it("falls back to today when no day has a free time", () => {
    const now = at(18, 40);
    const days = bookingDays(now);
    const full = days.flatMap((d) => fullDay("bopha", d));
    expect(firstDayWithTimes(full, "haircut", "bopha", days, now)).toBe(0);
  });
});

describe("dayToFollow", () => {
  const now = at(18, 40);
  const days = bookingDays(now);
  const base = [b("dara", at(10)), b("bopha", at(11, 0, D + 3 * DAY))];

  it("never follows the first snapshot", () => {
    expect(dayToFollow(null, base, days, days[0])).toBeNull();
  });

  it("follows a new hold on another day", () => {
    const hold = b("bopha", at(10, 0, D + DAY), "haircut", "held");
    expect(dayToFollow(seen(base), [...base, hold], days, days[0])).toBe(1);
  });

  it("follows a hold that becomes paid on another day", () => {
    const held = b("bopha", at(10, 0, D + 2 * DAY), "haircut", "held", "p1");
    const paid = { ...held, status: "booked" as const };
    expect(dayToFollow(seen([...base, held]), [...base, paid], days, days[0])).toBe(2);
  });

  it("stays put when the new booking is on the day shown", () => {
    const hold = b("bopha", at(10, 0, D + DAY), "haircut", "held");
    expect(dayToFollow(seen(base), [...base, hold], days, days[1])).toBeNull();
  });

  it("ignores expiry and staff status changes", () => {
    const held = b("bopha", at(10, 0, D + DAY), "haircut", "held", "e1");
    expect(dayToFollow(seen([...base, held]), [...base, { ...held, status: "expired" }], days, days[0])).toBeNull();
    const arrived = { ...base[1], status: "arrived" as const };
    expect(dayToFollow(seen(base), [base[0], arrived], days, days[0])).toBeNull();
  });

  it("ignores a booking outside the seven days", () => {
    const far = b("bopha", at(10, 0, D + 9 * DAY), "haircut", "held");
    expect(dayToFollow(seen(base), [...base, far], days, days[0])).toBeNull();
  });

  it("follows the latest of several new bookings", () => {
    const one = b("bopha", at(10, 0, D + DAY), "haircut", "held");
    const two = b("dara", at(10, 0, D + 4 * DAY), "haircut", "held");
    expect(dayToFollow(seen(base), [...base, one, two], days, days[0])).toBe(4);
  });
});
