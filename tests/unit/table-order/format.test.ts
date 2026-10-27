import { expect, test } from "vitest";
import { ageLabel, optionSummary } from "@/features/table-order/format";

test("option summary names what differs from a plain order", () => {
  expect(optionSummary({ size: "large", ice: "less", sugar: "50" }, "en")).toBe("Large · Less ice · 50% sugar");
  expect(optionSummary({ size: "regular", ice: "normal", sugar: "100" }, "en")).toBe("Regular · Normal ice");
  expect(optionSummary({ warm: "yes" }, "en")).toBe("Warmed");
  expect(optionSummary({ warm: "no" }, "en")).toBe("");
  expect(optionSummary({ size: "large", ice: "none", sugar: "0" }, "km")).toBe("ធំ · គ្មានទឹកកក · ស្ករ 0%");
  expect(optionSummary({ ice: "less" }, "km")).toBe("ទឹកកកតិច");
});

test("ticket age reads 'just now' under 45 seconds, then m:ss", () => {
  expect(ageLabel(10_000)).toBe("just now");
  expect(ageLabel(220_000)).toBe("3:40");
  expect(ageLabel(65_000)).toBe("1:05");
});
