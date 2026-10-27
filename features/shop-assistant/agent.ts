import { checkStock, createOrder, quoteDelivery, searchProducts, ToolError } from "./tools";
import type { Card, ChatModel, ChatTurn, ToolCall, ToolResult } from "./model";
import { COLORS } from "./catalog";

const MAX_TURNS = 12;
const MAX_TURN_CHARS = 600;

/** Validates a client-sent history: known roles and text only, repeated roles merged, last 12 turns, starts and ends with the customer. */
export function cleanHistory(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: ChatTurn[] = [];
  for (const t of raw) {
    if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.text !== "string") return null;
    const text = t.text.trim().slice(0, MAX_TURN_CHARS);
    if (!text) continue;
    const last = turns.at(-1);
    if (last && last.role === t.role) last.text = `${last.text}\n${text}`.slice(0, MAX_TURN_CHARS);
    else turns.push({ role: t.role, text });
  }
  const recent = turns.slice(-MAX_TURNS);
  while (recent[0]?.role === "assistant") recent.shift();
  return recent.length && recent.at(-1)!.role === "user" ? recent : null;
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Runs one tool call. Refusals come back as `{ error, message }` for the model to explain; they never fail the turn. */
export function executeTool(call: ToolCall): { result: unknown; cards: Card[] } {
  const a: Args = call.args && typeof call.args === "object" ? (call.args as Args) : {};
  try {
    switch (call.name) {
      case "search_products": {
        const products = searchProducts({ text: str(a.text), category: str(a.category), color: str(a.color), size: str(a.size), maxPrice: typeof a.maxPrice === "number" ? a.maxPrice : undefined });
        const color = COLORS.find((c) => c.id === str(a.color)?.toLowerCase())?.id;
        return {
          result: { products: products.map((p) => ({ id: p.id, name: p.name.en, nameKm: p.name.km, category: p.category, price: p.price, colors: p.colors.map((c) => c.id), sizes: p.sizes })) },
          cards: products.map((product) => ({ type: "product", product, ...(color && product.colors.some((c) => c.id === color) && { color }) })),
        };
      }
      case "check_stock":
        return { result: checkStock(String(a.productId ?? ""), str(a.color), str(a.size)), cards: [] };
      case "quote_delivery": {
        const q = quoteDelivery(String(a.zone ?? ""));
        return { result: q, cards: "zone" in q ? [{ type: "delivery", zone: q.zone }] : [] };
      }
      case "create_order": {
        const order = createOrder(a as Parameters<typeof createOrder>[0]);
        return { result: { id: order.id, total: order.total, delivery: order.delivery, zone: order.zone.name.en, lines: order.lines.map((l) => `${l.qty}× ${l.name.en} ${l.color.id} ${l.size}`), payment: "A KHQR payment card is shown to the customer under your reply." }, cards: [{ type: "order", order }] };
      }
      default:
        return { result: { error: "unknown_tool" }, cards: [] };
    }
  } catch (e) {
    if (e instanceof ToolError) return { result: { error: e.code, message: e.message }, cards: [] };
    return { result: { error: "failed" }, cards: [] };
  }
}

/** Cards for the customer: the latest product search (up to 4), then the latest delivery quote, then the latest order. */
function collect(cards: Card[], fresh: Card[]): Card[] {
  const out = fresh.some((c) => c.type === "product") ? cards.filter((c) => c.type !== "product") : [...cards];
  for (const c of fresh) {
    if (c.type !== "product") for (let i = out.length - 1; i >= 0; i--) if (out[i].type === c.type) out.splice(i, 1);
    out.push(c);
  }
  const order = { product: 0, delivery: 1, order: 2 } as const;
  return out.sort((x, y) => order[x.type] - order[y.type]);
}

/** The cards a list of tool calls produces, exactly as a live turn would gather them (used to replay the sample chat). */
export const cardsFor = (calls: ToolCall[]): Card[] => calls.reduce<Card[]>((cards, call) => collect(cards, executeTool(call).cards), []);

class Timeout extends Error {}

/** One customer message: ask the model, run the tools it asks for, repeat up to `maxSteps`. Any failure or timeout is "busy". */
export async function runTurn(
  history: ChatTurn[],
  model: ChatModel,
  opts: { maxSteps?: number; timeoutMs?: number; onModelCall?: () => boolean } = {},
): Promise<{ text: string; cards: Card[] } | { error: "busy" }> {
  const { maxSteps = 4, timeoutMs = 15_000, onModelCall } = opts;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Timeout()); }, timeoutMs);
  });

  const results: ToolResult[] = [];
  let cards: Card[] = [];
  try {
    for (let step = 0; step < maxSteps; step++) {
      if (onModelCall && !onModelCall()) return { error: "busy" };
      const reply = await Promise.race([model.next(history, results, abort.signal), deadline]);
      if ("text" in reply) {
        const text = reply.text.trim();
        return text || cards.length ? { text, cards } : { error: "busy" };
      }
      for (const call of reply.calls) {
        const { result, cards: fresh } = executeTool(call);
        results.push({ call, result, step });
        cards = collect(cards, fresh);
      }
    }
    return cards.length ? { text: "", cards } : { error: "busy" };
  } catch {
    return { error: "busy" };
  } finally {
    clearTimeout(timer);
  }
}
