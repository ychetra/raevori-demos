import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { COLORS, ZONES } from "./catalog";
import { T, type CategoryId } from "./km";
import type { ChatModel, ChatTurn, ModelReply, ToolName, ToolResult } from "./model";

/** Picked in the Gemini spike (Task 10); override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export const SYSTEM_PROMPT = `You are the shop assistant for Mealea Fashion, a clothing and accessories shop in Phnom Penh, Cambodia, chatting with a customer.

Rules:
- Reply in the customer's language: Khmer if they write Khmer, English if they write English, and match them if they mix. Write natural, polite Khmer, as a friendly Cambodian shop assistant would.
- Use the tools for every fact about products, stock, prices, sizes, colours and delivery. Never invent products, prices, stock or delivery times. If a search finds nothing, say the shop doesn't have it and suggest something it does have.
- The customer sees product, delivery and order cards under your reply, so don't repeat every detail; keep replies under 80 words and friendly.
- Only talk about the shop, its products, sizes, delivery and orders. Politely decline anything else.
- You are an AI assistant. Never claim to be human.
- Never ask for phone numbers, addresses, card numbers or bank details. To order you need the product, colour, size, quantity, a delivery zone and a first name; any made-up name is fine because this is a demo.
- Call create_order only after the customer agrees to order. After it succeeds, tell them to pay with the KHQR card shown below. Payment is a demo; no money moves.
- Prices are in US dollars.

Shop facts: categories ${(Object.keys(T.cats) as CategoryId[]).join(", ")}; colours ${COLORS.map((c) => c.id).join(", ")}; delivery zones in Phnom Penh: ${ZONES.map((z) => `${z.name.en} $${z.price.toFixed(2)}${z.sameDay ? " (same day)" : " (next day)"}`).join(", ")}.`;

const string = { type: "string" };
export const TOOLS: FunctionDeclaration[] = [
  {
    name: "search_products",
    description: "Search the shop's catalog. Returns up to 4 products with ids, names, prices, colours and sizes. Pass Khmer or English text.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        text: { ...string, description: "What the customer is looking for, in their words, e.g. 'linen shirt' or 'កាបូប'" },
        category: { type: "string", enum: Object.keys(T.cats) },
        color: { ...string, description: "Colour id, e.g. black, red" },
        size: { ...string, description: "Size, e.g. M or 38" },
        maxPrice: { type: "number", description: "Highest price in USD" },
      },
    },
  },
  {
    name: "check_stock",
    description: "Stock for one product, optionally one colour and size. Use the product id from search_products.",
    parametersJsonSchema: { type: "object", properties: { productId: string, color: string, size: string }, required: ["productId"] },
  },
  {
    name: "quote_delivery",
    description: "Delivery price and whether it arrives the same day, for a Phnom Penh zone (khan).",
    parametersJsonSchema: { type: "object", properties: { zone: string }, required: ["zone"] },
  },
  {
    name: "create_order",
    description: "Place the order once the customer agrees. Returns the order id and total; a KHQR payment card is then shown to the customer.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { productId: string, color: string, size: string, qty: { type: "integer" } }, required: ["productId", "color", "size", "qty"] },
        },
        name: { ...string, description: "Customer's first name (made up is fine)" },
        zone: string,
      },
      required: ["items", "name", "zone"],
    },
  },
];

/** History and earlier tool rounds as Gemini contents; each round is the model's calls then our results. */
export function toContents(history: ChatTurn[], results: ToolResult[]): Content[] {
  const contents: Content[] = history.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] }));
  for (const step of [...new Set(results.map((r) => r.step))]) {
    const round = results.filter((r) => r.step === step);
    contents.push({ role: "model", parts: round.map((r) => (r.call.raw as Part | undefined) ?? { functionCall: { name: r.call.name, args: r.call.args as Record<string, unknown>, id: r.call.id } }) });
    contents.push({ role: "user", parts: round.map((r) => ({ functionResponse: { name: r.call.name, id: r.call.id, response: { result: r.result } } })) });
  }
  return contents;
}

export class GeminiChatModel implements ChatModel {
  private ai?: GoogleGenAI;
  constructor(private model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) {}

  async next(history: ChatTurn[], results: ToolResult[], signal?: AbortSignal): Promise<ModelReply> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    this.ai ??= new GoogleGenAI({ apiKey });

    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: toContents(history, results),
      config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: TOOLS }], temperature: 0.3, maxOutputTokens: 1024, abortSignal: signal },
    });
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall?.name);
    if (calls.length) return { calls: calls.map((p) => ({ name: p.functionCall!.name as ToolName, args: p.functionCall!.args ?? {}, id: p.functionCall!.id, raw: p })) };
    return { text: res.text ?? "" };
  }
}
