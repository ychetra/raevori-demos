import type { Order, OrderLine } from "@/features/table-order/types";

/** One paid order, from generated history or (with `live`) from a Table Order room. */
export type Sale = { id: string; table: number; lines: OrderLine[]; total: number; payment: "khqr" | "cash"; at: number; live?: true };

/** A Table Order order as a sale: paid by KHQR at the moment it was placed. */
export function fromOrder(o: Order): Sale {
  return { id: o.id, table: o.table, lines: o.lines, total: o.total, payment: "khqr", at: o.at.new ?? o.at.preparing ?? o.at.ready ?? 0, live: true };
}
