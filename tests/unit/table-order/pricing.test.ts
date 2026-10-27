import { describe, expect, test } from "vitest";
import { MENU } from "@/features/table-order/menu";
import { PricingError, priceOrder } from "@/features/table-order/pricing";

describe("menu", () => {
  test("has about 14 items across the 4 categories, each with Khmer and English names", () => {
    expect(MENU.length).toBeGreaterThanOrEqual(12);
    expect(new Set(MENU.map((m) => m.cat))).toEqual(new Set(["coffee", "tea", "smoothie", "bakery"]));
    for (const m of MENU) {
      expect(m.name.en.length).toBeGreaterThan(0);
      expect(m.name.km).toMatch(/[ក-៿]/);
    }
  });
});

describe("priceOrder", () => {
  test("2 large iced lattes cost $5.50", () => {
    const { total, lines } = priceOrder([{ itemId: "iced-latte", qty: 2, options: { size: "large" } }]);
    expect(total).toBe(5.5);
    expect(lines[0].unitPrice).toBe(2.75);
    expect(lines[0].name.en).toBe("Iced latte");
  });

  test("missing option groups fall back to their defaults", () => {
    const { lines } = priceOrder([{ itemId: "iced-latte", qty: 1, options: {} }]);
    expect(lines[0].options).toEqual({ size: "regular", ice: "normal", sugar: "100" });
  });

  test("totals are exact to the cent across several lines", () => {
    const { total } = priceOrder([
      { itemId: "iced-latte", qty: 3, options: { size: "large" } },
      { itemId: "butter-croissant", qty: 1, options: {} },
    ]);
    expect(total).toBe(10.25);
  });

  test("unknown item id is rejected", () => {
    expect(() => priceOrder([{ itemId: "free-money", qty: 1, options: {} }])).toThrow(PricingError);
  });

  test("unknown option group or choice is rejected", () => {
    expect(() => priceOrder([{ itemId: "iced-latte", qty: 1, options: { size: "huge" } }])).toThrow(PricingError);
    expect(() => priceOrder([{ itemId: "iced-latte", qty: 1, options: { topping: "gold" } }])).toThrow(PricingError);
  });

  test.each([0, -1, 1.5, 21, Number.NaN])("quantity %s is rejected", (qty) => {
    expect(() => priceOrder([{ itemId: "iced-latte", qty, options: {} }])).toThrow(PricingError);
  });

  test("empty orders and more than 20 lines are rejected", () => {
    expect(() => priceOrder([])).toThrow(PricingError);
    const many = Array.from({ length: 21 }, () => ({ itemId: "iced-latte", qty: 1, options: {} }));
    expect(() => priceOrder(many)).toThrow(PricingError);
  });

  test("client-supplied prices and extra fields are ignored", () => {
    const tampered = [{ itemId: "iced-latte", qty: 1, options: {}, unitPrice: 0.01, name: { en: "x", km: "x" } }];
    const { total, lines } = priceOrder(tampered as never);
    expect(total).toBe(2.25);
    expect(lines[0]).not.toHaveProperty("unitPrice", 0.01);
  });
});
