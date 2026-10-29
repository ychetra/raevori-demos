import { describe, expect, test, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent } } }));

import { DEFAULT_GEMINI_MODEL, GeminiChatModel, SYSTEM_PROMPT, TOOLS, cleanReply, geminiConfig, toContents } from "@/features/shop-assistant/gemini";

describe("Gemini adapter", () => {
  test("declares exactly the four shop tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["search_products", "check_stock", "quote_delivery", "create_order"]);
  });

  test("system prompt carries the shop rules", () => {
    for (const rule of ["Mealea Fashion", "Never claim to be human", "under 80 words", "Toul Kork $1.50", "only Khmer script", "latest message"]) expect(SYSTEM_PROMPT).toContain(rule);
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

  test("the default model is a pinned id, not a moving -latest alias", () => {
    expect(DEFAULT_GEMINI_MODEL).toMatch(/^gemini-\d/);
    expect(DEFAULT_GEMINI_MODEL).not.toMatch(/latest/);
  });

  test("thinking stays low: a level on 3.x models, a zero budget on 2.5", () => {
    expect(geminiConfig("gemini-3.5-flash").thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(geminiConfig("gemini-2.5-flash").thinkingConfig).toEqual({ thinkingBudget: 0 });
    for (const m of ["gemini-3.5-flash", "gemini-2.5-flash"]) expect(geminiConfig(m).maxOutputTokens).toBeGreaterThanOrEqual(1024);
  });

  test("every request sends the thinking config and the output limit", async () => {
    process.env.GEMINI_API_KEY = "test";
    generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }], text: "Hi" });
    await new GeminiChatModel("gemini-3.5-flash").next([{ role: "user", text: "hi" }], []);
    const { model, config } = generateContent.mock.calls[0][0];
    expect(model).toBe("gemini-3.5-flash");
    expect(config).toMatchObject(geminiConfig("gemini-3.5-flash"));
    expect(config.tools[0].functionDeclarations).toBe(TOOLS);
  });

  test("the request names the language of the customer's latest message", async () => {
    const reply = { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }], text: "ok" };
    generateContent.mockResolvedValue(reply);
    const model = new GeminiChatModel("gemini-3.5-flash-lite");
    await model.next([{ role: "user", text: "អាវខ្មៅ" }, { role: "assistant", text: "មាន" }, { role: "user", text: "I'll take one, deliver to Toul Kork" }], []);
    expect(generateContent.mock.lastCall![0].config.systemInstruction).toContain("Reply in English");
    await model.next([{ role: "user", text: "Hi, មាន jeans ទេ?" }], []);
    expect(generateContent.mock.lastCall![0].config.systemInstruction).toContain("Reply in Khmer");
  });

  test("replies lose letters from scripts that never belong in a Khmer or English reply", () => {
    expect(cleanReply("បាទ មានតើ! ហựយើងខ្ញុំមាន")).toBe("បាទ មានតើ! ហយើងខ្ញុំមាន");
    expect(cleanReply("សូមពិនិត្យកាត KHQR ด้านក្រោម")).toBe("សូមពិនិត្យកាត KHQR ក្រោម");
    expect(cleanReply("ក្រមាសូត្រតម្លៃ $12 です។")).toBe("ក្រមាសូត្រតម្លៃ $12។");
    expect(cleanReply("Linen shirt — $18, size M. Café!")).toBe("Linen shirt — $18, size M. Café!");
  });

  test("text replies come back cleaned", async () => {
    generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "x" }] }, finishReason: "STOP" }], text: "មាន ហự" });
    expect(await new GeminiChatModel("gemini-3.5-flash-lite").next([{ role: "user", text: "មាន?" }], [])).toEqual({ text: "មាន ហ" });
  });
});
