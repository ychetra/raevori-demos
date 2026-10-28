import { MENU, MENU_BY_ID } from "./menu";
import type { CartLine, MenuItem, OrderLine } from "./types";

export class PricingError extends Error {}

const MAX_QTY = 20;
const MAX_LINES = 20;

/**
 * Prices an order from the menu alone: the room's menu on the server, the default MENU elsewhere.
 * Anything the client sends besides itemId/qty/options is ignored. Sold-out and hidden items are priced; the store refuses them.
 */
export function priceOrder(lines: CartLine[], menu: MenuItem[] = MENU): { lines: OrderLine[]; total: number } {
  if (!Array.isArray(lines) || lines.length === 0) throw new PricingError("empty order");
  if (lines.length > MAX_LINES) throw new PricingError("too many lines");
  const byId = menu === MENU ? MENU_BY_ID : new Map(menu.map((m) => [m.id, m]));

  let totalCents = 0;
  const priced = lines.map((line): OrderLine => {
    const item = byId.get(line?.itemId);
    if (!item) throw new PricingError(`unknown item ${line?.itemId}`);
    const qty = line.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new PricingError("bad quantity");

    const given = line.options && typeof line.options === "object" ? line.options : {};
    for (const key of Object.keys(given)) if (!item.options.some((g) => g.id === key)) throw new PricingError(`unknown option ${key}`);

    let unitCents = Math.round(item.price * 100);
    const options: Record<string, string> = {};
    for (const group of item.options) {
      const choiceId = given[group.id] ?? group.default;
      const choice = group.choices.find((c) => c.id === choiceId);
      if (!choice) throw new PricingError(`unknown choice ${choiceId}`);
      options[group.id] = choice.id;
      unitCents += Math.round(choice.delta * 100);
    }
    totalCents += unitCents * qty;
    return { itemId: item.id, qty, options, name: item.name, unitPrice: unitCents / 100 };
  });

  return { lines: priced, total: totalCents / 100 };
}
