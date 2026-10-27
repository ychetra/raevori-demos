import { describe, expect, test } from "vitest";
import { createRoomLimiter } from "@/features/table-order/server";

const HOUR = 60 * 60 * 1000;
const clock = (start = 1_000_000) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };

describe("createRoomLimiter", () => {
  test("20 rooms per IP per rolling hour; the 21st is refused until an hour has passed", () => {
    const c = clock();
    const lim = createRoomLimiter({ perHour: 20, now: c.now });
    for (let i = 0; i < 20; i++) {
      expect(lim.allow("1.1.1.1")).toBe(true);
      c.tick(1000);
    }
    expect(lim.allow("1.1.1.1")).toBe(false);
    c.tick(HOUR - 20 * 1000); // the first room is now exactly an hour old
    expect(lim.allow("1.1.1.1")).toBe(true);
    expect(lim.allow("1.1.1.1")).toBe(false);
    c.tick(HOUR);
    for (let i = 0; i < 20; i++) expect(lim.allow("1.1.1.1")).toBe(true);
  });

  test("a refused attempt does not count", () => {
    const c = clock();
    const lim = createRoomLimiter({ perHour: 2, now: c.now });
    expect([lim.allow("a"), lim.allow("a")]).toEqual([true, true]);
    for (let i = 0; i < 10; i++) expect(lim.allow("a")).toBe(false);
    c.tick(HOUR);
    expect([lim.allow("a"), lim.allow("a"), lim.allow("a")]).toEqual([true, true, false]);
  });

  test("different IPs are independent", () => {
    const lim = createRoomLimiter({ perHour: 20, now: clock().now });
    for (let i = 0; i < 20; i++) lim.allow("1.1.1.1");
    expect(lim.allow("1.1.1.1")).toBe(false);
    expect(lim.allow("2.2.2.2")).toBe(true);
  });

  test("IPs idle for an hour are forgotten", () => {
    const c = clock();
    const lim = createRoomLimiter({ perHour: 20, now: c.now });
    for (let i = 0; i < 100; i++) lim.allow(`10.0.0.${i}`);
    expect(lim.size()).toBe(100);
    c.tick(HOUR);
    lim.allow("2.2.2.2");
    expect(lim.size()).toBe(1);
  });
});
