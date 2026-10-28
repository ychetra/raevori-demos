import type { Text } from "@/lib/i18n";

/** The kitchen moves an order new → preparing → ready; the owner's admin closes it as done (collected) or cancelled. */
export type OrderStatus = "new" | "preparing" | "ready" | "done" | "cancelled";
export type Category = "coffee" | "tea" | "smoothie" | "bakery";

export type OptionGroup = { id: string; name: Text; choices: { id: string; name: Text; delta: number }[]; default: string };
/** `art` picks the illustration: a cup filled with `fill` (drinks) or a pastry shape. `soldOut` and `hidden` are set in the owner's admin. */
export type MenuItem = { id: string; cat: Category; name: Text; note?: Text; price: number; image: string; options: OptionGroup[]; soldOut?: boolean; hidden?: boolean };

/** The shop's own settings, per room. `open`/`close` are "HH:MM" Phnom Penh time; `close` may be "24:00". */
export type ShopSettings = { name: string; tables: number; open: string; close: string };

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
  cancelReason?: string;
};

export type RoomEvent =
  | { type: "snapshot"; orders: Order[]; menu: MenuItem[]; settings: ShopSettings }
  | { type: "order"; order: Order }
  | { type: "menu"; menu: MenuItem[] }
  | { type: "settings"; settings: ShopSettings };
/** `pin` is the owner's admin PIN: only the room's creator is told it, never a snapshot or an event. */
export type Room = { id: string; orders: Order[]; menu: MenuItem[]; settings: ShopSettings; pin: string; touchedAt: number };
