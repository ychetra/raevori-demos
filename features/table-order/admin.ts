import { PP_OFFSET_MS, DAY_MS } from "@/features/shop-pulse/time";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { KHR_RATE } from "@/lib/money";
import { optionSummary } from "./format";
import { DEFAULT_ART, optionsFor } from "./menu";
import type { Category, MenuItem, OptionGroup, Order, ShopSettings } from "./types";

/** Rules for the owner's admin: what an item edit, a new item, the settings and a cancel reason may be, plus the hours and the CSV. Pure, so the phone can share them. */

/** A rejected admin input; `field` names the part that was wrong (the API answers 400 `{ error: "invalid", field }`). */
export class AdminError extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
  }
}

// Open all day by default: visitors come from every time zone, and a demo that refuses orders at night looks broken.
// The owner can set real hours in the admin to see the closed state.
export const DEFAULT_SETTINGS: ShopSettings = { name: "Lotus Coffee", tables: 12, open: "00:00", close: "24:00" };
export const MAX_ITEMS = 60;
export const MAX_TABLES = 50;
export const CATEGORIES: Category[] = ["coffee", "tea", "smoothie", "bakery"];

type Input = Record<string, unknown>;
const obj = (x: unknown, field: string): Input => {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new AdminError(field);
  return x as Input;
};
const str = (x: unknown, min: number, max: number, field: string): string => {
  const s = typeof x === "string" ? x.trim() : null;
  if (s === null || s.length < min || s.length > max) throw new AdminError(field);
  return s;
};
const text = (x: unknown, min: number, max: number, field: string): Text => {
  const t = obj(x, field);
  return { en: str(t.en, min, max, field), km: str(t.km, min, max, field) };
};
/** Dollars from `min` to $100 in 25-cent steps. */
const amount = (x: unknown, min: number, field: string): number => {
  if (typeof x !== "number" || !Number.isInteger(x * 4) || x < min || x > 100) throw new AdminError(field);
  return x;
};
const isCategory = (x: unknown): x is Category => CATEGORIES.includes(x as Category);
/** Drinks are a cup or a mug in a #rrggbb colour (the colour goes into the SVG, so nothing else passes); bakery items are a pastry. */
const artFits = (image: unknown, cat: Category) =>
  typeof image === "string" && (cat === "bakery" ? /^(croissant|loaf)$/.test(image) : /^(cup|mug):#[0-9a-fA-F]{6}$/.test(image));

/** New option prices: `{ size: { large: 0.75 } }`. Only existing groups and choices; deltas $0-$100 in 25-cent steps. */
function deltas(groups: OptionGroup[], x: unknown): OptionGroup[] {
  const given = obj(x, "options");
  for (const [groupId, choices] of Object.entries(given)) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) throw new AdminError("options");
    for (const [choiceId, delta] of Object.entries(obj(choices, "options"))) {
      if (!group.choices.some((c) => c.id === choiceId)) throw new AdminError("options");
      amount(delta, 0, "options");
    }
  }
  return groups.map((g) => {
    const set = given[g.id] as Record<string, number> | undefined;
    return set ? { ...g, choices: g.choices.map((c) => (Object.hasOwn(set, c.id) ? { ...c, delta: set[c.id] } : c)) } : g;
  });
}

/**
 * `item` with the fields in `patch` changed; fields left out are kept, `id` and unknown fields are ignored.
 * A note of "" in both languages (or null) removes it. Returns a new object: orders already placed keep the old name and price.
 */
export function editItem(item: MenuItem, patch: unknown): MenuItem {
  const p = obj(patch, "item");
  const next: MenuItem = { ...item };
  if (p.name !== undefined) next.name = text(p.name, 1, 40, "name");
  if (p.note !== undefined) {
    const note = p.note === null ? null : text(p.note, 0, 120, "note");
    if (note && (note.en || note.km)) next.note = note;
    else delete next.note;
  }
  if (p.price !== undefined) next.price = amount(p.price, 0.25, "price");
  if (p.cat !== undefined) {
    if (!isCategory(p.cat)) throw new AdminError("cat");
    next.cat = p.cat;
  }
  if (p.image !== undefined) next.image = p.image as string;
  if (!artFits(next.image, next.cat)) throw new AdminError("image");
  if (p.options !== undefined) next.options = deltas(item.options, p.options);
  for (const flag of ["soldOut", "hidden"] as const) {
    if (p[flag] === undefined) continue;
    if (typeof p[flag] !== "boolean") throw new AdminError(flag);
    if (p[flag]) next[flag] = true;
    else delete next[flag];
  }
  return next;
}

/** A new menu item with the server's `id`. Name, price and category are required; the art defaults to the category's, the options come from the art. */
export function newItem(input: unknown, id: string): MenuItem {
  const p = obj(input, "item");
  if (!isCategory(p.cat)) throw new AdminError("cat");
  if (p.name === undefined) throw new AdminError("name");
  if (p.price === undefined) throw new AdminError("price");
  const image = p.image === undefined ? DEFAULT_ART[p.cat] : p.image;
  if (!artFits(image, p.cat)) throw new AdminError("image");
  return editItem({ id, cat: p.cat, name: { en: "", km: "" }, price: 0, image: image as string, options: optionsFor(p.cat, image as string) }, p);
}

/** "07:30" → 450. "24:00" is allowed as a closing time (open until midnight). */
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const TIME = /^(?:(?:[01]\d|2[0-3]):(?:00|30)|24:00)$/;

/** Validated settings: name 1-40 characters, 1-50 tables, open before close, both on the hour or half hour. Unknown fields are dropped. */
export function parseSettings(input: unknown): ShopSettings {
  const p = obj(input, "settings");
  const name = str(p.name, 1, 40, "name");
  const tables = p.tables;
  if (typeof tables !== "number" || !Number.isInteger(tables) || tables < 1 || tables > MAX_TABLES) throw new AdminError("tables");
  for (const f of ["open", "close"] as const) if (typeof p[f] !== "string" || !TIME.test(p[f] as string)) throw new AdminError(f);
  const open = p.open as string;
  const close = p.close as string;
  if (minutes(open) >= minutes(close)) throw new AdminError("close");
  return { name, tables, open, close };
}

/** A cancel reason: 1-120 characters after trimming. */
export const parseReason = (x: unknown): string => str(x, 1, 120, "reason");

/** True while the shop is open at `ms`, Phnom Penh time: from `open` up to (not including) `close`. */
export function isOpen(settings: Pick<ShopSettings, "open" | "close">, ms: number): boolean {
  const m = Math.floor((((ms + PP_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);
  return m >= minutes(settings.open) && m < minutes(settings.close);
}

const cell = (s: string | number) => {
  const v = String(s);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const ppIso = (ms: number) => new Date(ms + PP_OFFSET_MS).toISOString();

/**
 * The room's orders as CSV for Excel: a UTF-8 BOM (so Khmer opens correctly), CRLF lines, oldest first, Phnom Penh date and time.
 * Item names in `lang`; the header stays English so the columns are the same in both languages.
 */
export function ordersCsv(orders: Order[], lang: Lang): string {
  const rows = [["date", "time", "order no.", "table", "items", "total USD", "total KHR", "payment", "status"]];
  for (const o of [...orders].sort((a, b) => (a.at.new ?? 0) - (b.at.new ?? 0))) {
    const at = ppIso(o.at.new ?? 0);
    const items = o.lines.map((l) => {
      const opts = optionSummary(l.options, lang);
      return `${l.qty}× ${pick(l.name, lang)}${opts ? ` (${opts})` : ""}`;
    });
    rows.push([at.slice(0, 10), at.slice(11, 16), o.id, String(o.table), items.join("; "), o.total.toFixed(2), String(Math.round(o.total * KHR_RATE)), "KHQR", o.status]);
  }
  return `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`;
}
