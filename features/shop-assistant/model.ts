import type { Product, Zone } from "./catalog";
import type { ColorId } from "./km";
import type { ShopOrder } from "./tools";

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type Card = { type: "product"; product: Product; color?: ColorId } | { type: "delivery"; zone: Zone } | { type: "order"; order: ShopOrder };
export type ToolName = "search_products" | "check_stock" | "quote_delivery" | "create_order";
/** `id` and `raw` are the provider's own call id and part, passed back untouched (Gemini needs its thought signatures). */
export type ToolCall = { name: ToolName; args: unknown; id?: string; raw?: unknown };
/** `step` groups the calls one model reply asked for. */
export type ToolResult = { call: ToolCall; result: unknown; step: number };
export type ModelReply = { text: string } | { calls: ToolCall[] };

/** The only thing the chat engine knows about an AI provider. Swap providers by writing another one of these. */
export interface ChatModel {
  next(history: ChatTurn[], toolResults: ToolResult[], signal?: AbortSignal): Promise<ModelReply>;
}
