import { describe, expect, test } from "vitest";
import { createLimiter } from "@/features/shop-assistant/limits";

// 2026-10-27 12:00 in Phnom Penh (UTC+7).
const NOON_PP = Date.UTC(2026, 9, 27, 5, 0, 0);
const clock = (start = NOON_PP) => { let t = start; return { now: () => t, set: (v: number) => { t = v; } }; };

describe("createLimiter", () => {
  test("the 21st message in a session is refused", () => {
    const lim = createLimiter();
    for (let i = 0; i < 20; i++) expect(lim.check("s1", `ip${i}`, "hi")).toEqual({ ok: true });
    expect(lim.check("s1", "ip99", "hi")).toEqual({ ok: false, reason: "session" });
    expect(lim.check("s2", "ip99", "hi")).toEqual({ ok: true });
  });

  test("the 61st message from one IP in a day is refused", () => {
    const lim = createLimiter();
    for (let i = 0; i < 60; i++) expect(lim.check(`s${i}`, "1.2.3.4", "hi")).toEqual({ ok: true });
    expect(lim.check("fresh", "1.2.3.4", "hi")).toEqual({ ok: false, reason: "ip" });
    expect(lim.check("fresh", "5.6.7.8", "hi")).toEqual({ ok: true });
  });

  test("a message over 300 characters is refused and not counted", () => {
    const lim = createLimiter({ perSession: 1 });
    expect(lim.check("s", "ip", "x".repeat(301))).toEqual({ ok: false, reason: "length" });
    expect(lim.check("s", "ip", "x".repeat(300))).toEqual({ ok: true });
  });

  test("Khmer length is counted in characters, not bytes", () => {
    const lim = createLimiter();
    expect(lim.check("s", "ip", "ក".repeat(300))).toEqual({ ok: true });
  });

  test("countModelCall returns false once the global daily cap is used, and check reports global", () => {
    const lim = createLimiter({ globalDay: 3 });
    expect([lim.countModelCall("ip"), lim.countModelCall("ip"), lim.countModelCall("ip")]).toEqual([true, true, true]);
    expect(lim.countModelCall("ip")).toBe(false);
    expect(lim.check("s", "ip", "hi")).toEqual({ ok: false, reason: "global" });
  });

  test("the global cap defaults to CHAT_GLOBAL_DAILY_CAP", () => {
    const prev = process.env.CHAT_GLOBAL_DAILY_CAP;
    process.env.CHAT_GLOBAL_DAILY_CAP = "2";
    try {
      const lim = createLimiter();
      expect([lim.countModelCall("ip"), lim.countModelCall("ip"), lim.countModelCall("ip")]).toEqual([true, true, false]);
    } finally {
      if (prev === undefined) delete process.env.CHAT_GLOBAL_DAILY_CAP;
      else process.env.CHAT_GLOBAL_DAILY_CAP = prev;
    }
  });

  test("counters reset after midnight in Phnom Penh, not UTC midnight", () => {
    const c = clock();
    const lim = createLimiter({ perIpDay: 1, perSession: 100, globalDay: 1, now: c.now });
    expect(lim.check("a", "ip", "hi")).toEqual({ ok: true });
    expect(lim.countModelCall("ip")).toBe(true);
    expect(lim.check("b", "ip", "hi")).toEqual({ ok: false, reason: "global" });

    c.set(Date.UTC(2026, 9, 27, 16, 59)); // 23:59 Phnom Penh, same day
    expect(lim.countModelCall("ip")).toBe(false);

    c.set(Date.UTC(2026, 9, 27, 17, 1)); // 00:01 Phnom Penh, next day (UTC is still the 27th)
    expect(lim.check("c", "ip", "hi")).toEqual({ ok: true });
    expect(lim.countModelCall("ip")).toBe(true);
  });

  test("one visitor cannot spend the whole day's model budget", () => {
    const lim = createLimiter({ globalDay: 200 });
    let n = 0;
    let verdict = lim.check(`s${n}`, "1.1.1.1", "hi");
    while (verdict.ok && n < 1000) {
      for (let k = 0; k < 4; k++) lim.countModelCall("1.1.1.1");
      verdict = lim.check(`s${++n}`, "1.1.1.1", "hi");
    }
    expect(verdict).toEqual({ ok: false, reason: "ip" });
    expect(lim.check("other", "2.2.2.2", "hi")).toEqual({ ok: true });
    expect(lim.countModelCall("2.2.2.2")).toBe(true);
  });

  test("an IP is refused with reason ip once its model budget is spent, and the call is not counted", () => {
    const lim = createLimiter({ globalDay: 20 }); // per-IP model budget: max(4, 20/4) = 5
    for (let i = 0; i < 5; i++) expect(lim.countModelCall("1.1.1.1")).toBe(true);
    expect(lim.countModelCall("1.1.1.1")).toBe(false);
    expect(lim.check("fresh", "1.1.1.1", "hi")).toEqual({ ok: false, reason: "ip" });
    // The refused call did not use the global budget: 15 calls remain for others.
    for (let i = 0; i < 15; i++) expect(lim.countModelCall(`ip${i}`)).toBe(true);
    expect(lim.countModelCall("ip99")).toBe(false);
  });

  test("perIpModelDay can be set and defaults to at least 4", () => {
    const small = createLimiter({ globalDay: 3 });
    expect([1, 2, 3].map(() => small.countModelCall("a"))).toEqual([true, true, true]); // global 3 binds first
    const lim = createLimiter({ globalDay: 200, perIpModelDay: 2 });
    expect([lim.countModelCall("a"), lim.countModelCall("a"), lim.countModelCall("a")]).toEqual([true, true, false]);
  });
});
