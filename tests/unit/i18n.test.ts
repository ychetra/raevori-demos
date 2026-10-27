import { expect, test } from "vitest";
import { pick } from "@/lib/i18n";
import { khr, usd } from "@/lib/money";

test("pick returns the text for the chosen language", () => {
  expect(pick({ en: "Tea", km: "តែ" }, "km")).toBe("តែ");
  expect(pick({ en: "Tea", km: "តែ" }, "en")).toBe("Tea");
});

test("usd formats dollars with two decimals", () => {
  expect(usd(4.5)).toBe("$4.50");
  expect(usd(19.5)).toBe("$19.50");
});

test("khr converts at 4,100 riel per dollar", () => {
  expect(khr(4.5)).toBe("18,450");
  expect(khr(7.5)).toBe("30,750");
});
