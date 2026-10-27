import type { Text } from "@/lib/i18n";

export type OrderStatus = "new" | "preparing" | "ready";
export type Category = "coffee" | "tea" | "smoothie" | "bakery";

export type OptionGroup = { id: string; name: Text; choices: { id: string; name: Text; delta: number }[]; default: string };
/** `art` picks the illustration: a cup filled with `fill` (drinks) or a pastry shape. */
export type MenuItem = { id: string; cat: Category; name: Text; note?: Text; price: number; image: string; options: OptionGroup[] };

export type CartLine = { itemId: string; qty: number; options: Record<string, string> };
export type OrderLine = CartLine & { name: Text; unitPrice: number };

export type Order = {
  id: string;
  room: string;
  table: number;
  lines: OrderLine[];
  total: number;
  payment: "khqr";
  status: OrderStatus;
  at: Partial<Record<OrderStatus, number>>;
};

export type RoomEvent = { type: "snapshot"; orders: Order[] } | { type: "order"; order: Order };
export type Room = { id: string; orders: Order[]; touchedAt: number };
