import { describe, expect, it } from "vitest";
import { T } from "@/features/booking/km";
import type { Booking } from "@/features/booking/types";
import { bookingDays, bookingIcs, dayLabel, fill, firstName, mmss, shown, withDeposit } from "@/features/booking/ui/format";

const at = (iso: string) => new Date(`${iso}+07:00`).getTime();
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "b1",
  room: "r",
  service: "haircut",
  stylist: "dara",
  start: at("2026-10-28T14:30:00"),
  end: at("2026-10-28T15:00:00"),
  name: "Sokha Chan",
  status: "booked",
  at: {},
  ...over,
});

describe("booking format", () => {
  it("fills placeholders", () => {
    expect(withDeposit(T.book.payDeposit, "en")).toBe("Pay $3 deposit");
    expect(fill(T.book.depositLine, "en", { d: "$3", x: "$5" })).toBe("Deposit $3 paid · pay $5 at the salon");
    expect(fill(T.book.step, "km", { n: 2 })).toContain("2");
  });

  it("counts down in m:ss and never goes negative", () => {
    expect(mmss(300_000)).toBe("5:00");
    expect(mmss(272_100)).toBe("4:33");
    expect(mmss(-5)).toBe("0:00");
  });

  it("lists today plus 6 days from Phnom Penh midnight", () => {
    const days = bookingDays(at("2026-10-28T23:30:00"));
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(at("2026-10-28T00:00:00"));
    expect(dayLabel(days[6], "en")).toBe("Tue 3 Nov");
  });

  it("hides expired holds and keeps live ones until the server expires them", () => {
    const now = at("2026-10-28T14:00:00");
    const list = [
      booking({ id: "a" }),
      booking({ id: "b", status: "expired" }),
      booking({ id: "c", status: "held", holdUntil: now + 1000 }),
      booking({ id: "d", status: "held", holdUntil: now - 1 }),
    ];
    expect(shown(list).map((b) => b.id)).toEqual(["a", "c", "d"]);
  });

  it("builds a UTC .ics event", () => {
    const ics = bookingIcs(booking(), "en", at("2026-10-28T14:00:00"));
    expect(ics).toContain("DTSTART:20261028T073000Z");
    expect(ics).toContain("DTEND:20261028T080000Z");
    expect(ics).toContain("SUMMARY:Haircut at Bopha Beauty");
    expect(ics).toContain("Deposit $3 paid · pay $5 at the salon");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
    expect(firstName("  Sokha Chan ")).toBe("Sokha");
  });
});
