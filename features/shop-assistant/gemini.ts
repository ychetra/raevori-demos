import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part, type ThinkingConfig, type ThinkingLevel } from "@google/genai";
import { COLORS, ZONES } from "./catalog";
import { T, type CategoryId } from "./km";
import type { ChatModel, ChatTurn, ModelReply, ToolName, ToolResult } from "./model";

/** Picked in the Gemini spike (Task 10); override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Keeps thinking low so a 2-tool turn stays well inside the 15 s budget; 3.x models take a level, 2.5 a token budget. */
export function geminiConfig(model: string): { thinkingConfig: ThinkingConfig; maxOutputTokens: number } {
  return model.startsWith("gemini-2.")
    ? { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1024 }
    : { thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel }, maxOutputTokens: 2048 };
}

export const SYSTEM_PROMPT = `You are the shop assistant for Mealea Fashion, a clothing and accessories shop in Phnom Penh, Cambodia, chatting with a customer.

Rules:
- Reply in the language of the customer's latest message: Khmer if it is Khmer, English if it is English; if they mix, answer in Khmer. Write natural, polite Khmer, as a friendly Cambodian shop assistant would.
- When you write Khmer, use only Khmer script, plus product names, sizes and prices as they appear in tool results. Never use Thai, Japanese, Vietnamese, Chinese or any other script.
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

/** Letters from scripts a Khmer or English reply never needs (Thai, Vietnamese-only Latin, CJK, kana, Hangul, stray combining marks); Flash-Lite sometimes slips them in. */
const FOREIGN = /[\u0300-\u036f\u0e00-\u0e7f\u1e00-\u1eff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g;

export const cleanReply = (text: string) => text.replace(FOREIGN, "").replace(/ {2,}/g, " ").replace(/ +([។៕!?.,])/g, "$1").trim();

/** Tells the model which language to answer in, from the customer's latest message, rather than leaving it to guess. */
function languageNote(history: ChatTurn[]) {
  const last = history.findLast((t) => t.role === "user")?.text ?? "";
  const lang = /[\u1780-\u17ff]/.test(last) ? "Khmer" : "English";
  return `\n\nThe customer's latest message is in ${lang}. Reply in ${lang}.`;
}

export class GeminiChatModel implements ChatModel {
  private ai?: GoogleGenAI;
  constructor(
    private model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    /** For the spike script: sees each raw response (finish reason, token usage). */
    private onResponse?: (res: GenerateContentResponse) => void,
  ) {}

  async next(history: ChatTurn[], results: ToolResult[], signal?: AbortSignal): Promise<ModelReply> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    this.ai ??= new GoogleGenAI({ apiKey });

    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: toContents(history, results),
      config: { systemInstruction: SYSTEM_PROMPT + languageNote(history), tools: [{ functionDeclarations: TOOLS }], temperature: 0.3, ...geminiConfig(this.model), abortSignal: signal },
    });
    this.onResponse?.(res);
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall?.name);
    if (calls.length) return { calls: calls.map((p) => ({ name: p.functionCall!.name as ToolName, args: p.functionCall!.args ?? {}, id: p.functionCall!.id, raw: p })) };
    return { text: cleanReply(res.text ?? "") };
  }
}
