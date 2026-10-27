import type { Text } from "@/lib/i18n";
import { T } from "./km";
import type { ToolCall } from "./model";

export type ReplayTurn = { user: Text; calls: ToolCall[]; reply: Text };

const shirt = { productId: "linen-shirt", color: "black", size: "M", qty: 1 };

/** The sample conversation, as real tool calls so its cards come from the real catalog. */
export const REPLAY: ReplayTurn[] = [
  { user: T.replay.u1, calls: [{ name: "search_products", args: { text: "linen shirt", color: "black", size: "M" } }, { name: "check_stock", args: { productId: "linen-shirt", color: "black", size: "M" } }], reply: T.replay.a1 },
  { user: T.replay.u2, calls: [{ name: "quote_delivery", args: { zone: "Toul Kork" } }], reply: T.replay.a2 },
  { user: T.replay.u3, calls: [{ name: "create_order", args: { items: [shirt], name: "Dara", zone: "Toul Kork" } }], reply: T.replay.a3 },
];
