import { describe, expect, test } from "vitest";
import { SYSTEM_PROMPT, TOOLS, toContents } from "@/features/shop-assistant/gemini";

describe("Gemini adapter", () => {
  test("declares exactly the four shop tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["search_products", "check_stock", "quote_delivery", "create_order"]);
  });

  test("system prompt carries the shop rules", () => {
    for (const rule of ["Mealea Fashion", "Never claim to be human", "under 80 words", "Toul Kork $1.50"]) expect(SYSTEM_PROMPT).toContain(rule);
  });

  test("each tool round becomes the model's calls then our results, keeping the provider's own part", () => {
    const raw = { functionCall: { name: "quote_delivery", args: { zone: "TK" } }, thoughtSignature: "sig" };
    const contents = toContents([{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }, { role: "user", text: "deliver?" }], [
      { step: 0, call: { name: "quote_delivery", args: { zone: "TK" }, raw }, result: { zone: { id: "toul-kork" } } },
      { step: 1, call: { name: "check_stock", args: { productId: "x" }, id: "c2" }, result: { error: "unknown_product" } },
    ]);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user", "model", "user", "model", "user"]);
    expect(contents[3].parts![0]).toBe(raw);
    expect(contents[4].parts![0].functionResponse).toMatchObject({ name: "quote_delivery", response: { result: { zone: { id: "toul-kork" } } } });
    expect(contents[5].parts![0].functionCall).toEqual({ name: "check_stock", args: { productId: "x" }, id: "c2" });
  });
});
