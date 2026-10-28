import { describe, expect, test } from "vitest";
import { isSecure, readCookie, sign, verify } from "@/lib/signed-cookie";

process.env.SESSION_SECRET = "test-secret";

describe("signed cookies", () => {
  test("a signed value verifies; a changed value or MAC does not", () => {
    const signed = sign("abc");
    expect(signed).toMatch(/^abc\.[\w-]+$/);
    expect(verify(signed)).toBe("abc");
    expect(verify(signed.replace("abc", "abd"))).toBeNull();
    expect(verify("abc.AAAA")).toBeNull();
    expect(verify(undefined)).toBeNull();
    expect(verify("abc")).toBeNull();
  });

  test("a purpose separates signatures, so one cookie can't stand in for another", () => {
    const admin = sign("room:123", "admin");
    expect(verify(admin, "admin")).toBe("room:123");
    expect(verify(admin)).toBeNull();
    expect(verify(sign("room:123"), "admin")).toBeNull();
  });

  test("readCookie finds a cookie by name; isSecure follows the URL or the proxy header", () => {
    const req = new Request("http://x", { headers: { cookie: "a=1; ra_s=v.m=; b=2" } });
    expect(readCookie(req, "ra_s")).toBe("v.m=");
    expect(readCookie(req, "c")).toBeUndefined();
    expect(isSecure(req)).toBe(false);
    expect(isSecure(new Request("https://x"))).toBe(true);
    expect(isSecure(new Request("http://x", { headers: { "x-forwarded-proto": "https" } }))).toBe(true);
  });
});
