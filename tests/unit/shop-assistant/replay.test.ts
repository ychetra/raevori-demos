import { describe, expect, test } from "vitest";
import { cardsFor } from "@/features/shop-assistant/agent";
import { REPLAY } from "@/features/shop-assistant/replay";

describe("sample chat", () => {
  test("has three turns in both languages", () => {
    expect(REPLAY.length).toBe(3);
    for (const t of REPLAY) for (const x of [t.user, t.reply]) expect(x.km).toMatch(/[ក-៿]/);
  });

  test("its tool calls produce the same cards as a live chat: shirt, delivery, then an order for $19.50", () => {
    expect(cardsFor(REPLAY[0].calls)).toMatchObject([{ type: "product", product: { id: "linen-shirt" }, color: "black" }]);
    expect(cardsFor(REPLAY[1].calls)).toMatchObject([{ type: "delivery", zone: { id: "toul-kork", price: 1.5 } }]);
    expect(cardsFor(REPLAY[2].calls)).toMatchObject([{ type: "order", order: { total: 19.5, name: "Dara" } }]);
  });
});
