import type { Text } from "@/lib/i18n";
import { CATALOG, CATEGORY_WORDS, COLORS, ONE_SIZE, PRODUCT_BY_ID, ZONE_ALIASES, ZONES, type Color, type Product, type Zone } from "./catalog";
import { T, type CategoryId, type ColorId } from "./km";

export type ToolErrorCode = "unknown_product" | "unknown_color" | "unknown_size" | "bad_qty" | "out_of_stock" | "unknown_zone" | "empty_order";

/** A tool refused its input. The message is written for the model, which relays it to the customer. */
export class ToolError extends Error {
  constructor(public code: ToolErrorCode, message: string) { super(message); }
}

const MAX_RESULTS = 4;
const MAX_QTY = 10;
const MAX_LINES = 10;

/** NFC, no zero-width characters, Khmer digits as Latin, lower case, single spaces. */
export function normalize(s: unknown): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[០-៩]/g, (d) => String(d.charCodeAt(0) - 0x17e0))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const isKhmer = (s: string) => /[ក-៿]/.test(s);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Latin words match whole (plural allowed); Khmer has no spaces, so Khmer terms match as substrings. */
function hasTerm(text: string, term: string): boolean {
  if (isKhmer(term)) return text.includes(term);
  return new RegExp(`(^|[^a-z0-9])${escape(term)}(s|es)?(?=$|[^a-z0-9])`).test(text);
}

const SIZE_WORDS = ["size", ...T.sizeWords];
const SIZE_IN_TEXT = new RegExp(`(?:${SIZE_WORDS.map(escape).join("|")})\\s*:?\\s*([a-z0-9]{1,4})(?![a-z0-9])`);
const ONE_SIZE_RE = /^(one ?size|free ?size|free|onesize)$/;

function normSize(input: unknown): string {
  const n = normalize(input);
  if (ONE_SIZE_RE.test(n) || n === normalize(T.oneSize.km)) return ONE_SIZE;
  let s = n;
  for (const w of SIZE_WORDS) s = s.replaceAll(w, "");
  return s.replace(/[\s:]/g, "").toUpperCase();
}

function resolveColor(input: unknown): Color | undefined {
  const n = normalize(input).replaceAll("ពណ៌", "").replace(/\s/g, "");
  return COLORS.find((c) => c.id === n || normalize(c.name.en) === n || c.name.km === n || T.colorWords[c.id]?.includes(n));
}

function resolveCategory(input: unknown): CategoryId | undefined {
  const n = normalize(input);
  return (Object.keys(T.cats) as CategoryId[]).find((id) =>
    id === n || normalize(T.cats[id].en) === n || T.cats[id].km === n || CATEGORY_WORDS[id].some((w) => n === w || n === `${w}s`) || T.catWords[id].includes(n));
}

/** Colour words in free text, longest first so "ខៀវចាស់" (navy) is not also read as "ខៀវ" (blue). */
const COLOR_TERMS = COLORS.flatMap((c) => [normalize(c.name.en), ...(c.name.km.length > 1 ? [c.name.km] : []), ...(T.colorWords[c.id] ?? [])].map((term) => ({ term, id: c.id })))
  .sort((a, b) => b.term.length - a.term.length);

function takeColors(text: string): { colors: Set<ColorId>; rest: string } {
  const colors = new Set<ColorId>();
  let rest = text;
  for (const { term, id } of COLOR_TERMS) {
    if (!hasTerm(rest, term)) continue;
    colors.add(id);
    rest = isKhmer(term) ? rest.replaceAll(term, " ") : rest.replace(new RegExp(`(^|[^a-z0-9])${escape(term)}(?=$|[^a-z0-9])`, "g"), "$1 ");
  }
  return { colors, rest };
}

// Words that name a whole category ("bag", "shirt") count as category matches, not as a match on one product's name.
const GENERIC = new Set(["bag", "shirt", "shoe", "dress", "top", "accessory"]);
const productTerms = (p: Product) => [...normalize(p.name.en).split(/[\s-]+/).filter((w) => w.length >= 3 && !GENERIC.has(w)), p.name.km];
const categoryTerms = (c: CategoryId) => [...CATEGORY_WORDS[c], normalize(T.cats[c].en), ...T.catWords[c]];

function matchScore(p: Product, text: string): number {
  let score = 0;
  for (const t of productTerms(p)) if (hasTerm(text, t)) score += 3;
  for (const chunk of text.split(/[^ក-៿]+/)) if (chunk.length >= 2 && p.name.km.includes(chunk)) score += 3;
  if (categoryTerms(p.category).some((t) => hasTerm(text, t))) score += 2;
  return score;
}

/** Finds up to 4 products. Free text may be Khmer, English or mixed and may carry a size ("size M", "ទំហំ ៣៨"). */
export function searchProducts(q: { text?: string; category?: string; color?: string; size?: string; maxPrice?: number }): Product[] {
  let text = normalize(q.text);
  let size = q.size ? normSize(q.size) : undefined;
  const sizeMatch = text.match(SIZE_IN_TEXT);
  if (sizeMatch) {
    size ??= normSize(sizeMatch[1]);
    text = text.replace(sizeMatch[0], " ");
  }

  let color: ColorId | undefined;
  if (q.color) {
    const c = resolveColor(q.color);
    if (!c) return [];
    color = c.id;
  }
  let category: CategoryId | undefined;
  if (q.category) {
    category = resolveCategory(q.category);
    if (!category) return [];
  }
  const maxPrice = typeof q.maxPrice === "number" && q.maxPrice > 0 ? q.maxPrice : undefined;

  const pool = CATALOG.filter((p) =>
    (!category || p.category === category) && (!color || p.colors.some((c) => c.id === color)) &&
    (!size || p.sizes.includes(size)) && (!maxPrice || p.price <= maxPrice));

  const { colors: wanted, rest } = takeColors(text);
  const hasFilter = Boolean(category || color || size || maxPrice);
  if (!rest.trim() && wanted.size === 0) return pool.slice(0, MAX_RESULTS);

  const colorBoost = (p: Product) => p.colors.filter((c) => wanted.has(c.id)).length;
  let ranked = pool.map((p) => ({ p, s: matchScore(p, rest) })).filter((x) => x.s > 0);
  if (ranked.length) ranked = ranked.map((x) => ({ p: x.p, s: x.s + colorBoost(x.p) }));
  else if (wanted.size) ranked = pool.map((p) => ({ p, s: colorBoost(p) })).filter((x) => x.s > 0);
  else return hasFilter ? pool.slice(0, MAX_RESULTS) : [];

  // A clear name match ("linen shirt") outranks loose matches (other linen, other tops) by 2 or more, which are then dropped.
  const top = Math.max(...ranked.map((x) => x.s));
  return ranked.filter((x) => x.s > top - 2).sort((a, b) => b.s - a.s).slice(0, MAX_RESULTS).map((x) => x.p);
}

function getProduct(id: unknown): Product {
  const p = PRODUCT_BY_ID.get(normalize(id) as Product["id"]);
  if (!p) throw new ToolError("unknown_product", `No product with id "${String(id)}". Use search_products to find ids.`);
  return p;
}

function colorOf(p: Product, input: unknown): Color {
  const c = resolveColor(input);
  if (!c || !p.colors.some((pc) => pc.id === c.id)) throw new ToolError("unknown_color", `${p.name.en} comes in ${p.colors.map((pc) => pc.id).join(", ")}.`);
  return c;
}

function sizeOf(p: Product, input: unknown): string {
  const s = normSize(input);
  if (!p.sizes.includes(s)) throw new ToolError("unknown_size", `${p.name.en} comes in sizes ${p.sizes.join(", ")}.`);
  return s;
}

/** Stock for a product, optionally narrowed to a colour and size. */
export function checkStock(productId: string, color?: string, size?: string): { inStock: boolean; qty: number; options: { color: string; size: string; qty: number }[] } {
  const p = getProduct(productId);
  const colors = color ? [colorOf(p, color).id] : p.colors.map((c) => c.id);
  const sizes = size ? [sizeOf(p, size)] : p.sizes;
  const options = colors.flatMap((c) => sizes.map((s) => ({ color: c, size: s, qty: p.stock[`${c}/${s}`] ?? 0 })));
  const qty = options.reduce((n, o) => n + o.qty, 0);
  return { inStock: qty > 0, qty, options };
}

const zoneKey = (s: unknown) => normalize(s).replace(/khan|district|ខណ្ឌ/g, "").replace(/[^a-z0-9ក-៿]/g, "");
const ZONE_KEYS = ZONES.map((z) => ({ zone: z, keys: [z.id, z.name.en, z.name.km, ...(ZONE_ALIASES[z.id] ?? [])].map(zoneKey) }));

/** Delivery price for a Phnom Penh zone, matched however the customer spells it. */
export function quoteDelivery(zone: string): { zone: Zone } | { error: "unknown_zone"; zones: string[] } {
  const k = zoneKey(zone);
  const hit = ZONE_KEYS.find((z) => z.keys.includes(k)) ?? (k ? ZONE_KEYS.find((z) => z.keys.some((key) => key.length >= 4 && k.includes(key))) : undefined);
  return hit ? { zone: hit.zone } : { error: "unknown_zone", zones: ZONES.map((z) => z.name.en) };
}

export type OrderLine = { productId: Product["id"]; name: Text; color: Color; size: string; qty: number; unitPrice: number; lineTotal: number };
export type ShopOrder = { id: string; name: string; zone: Zone; lines: OrderLine[]; delivery: number; total: number };

let orderSeq = 1000;

/** Prices an order from the catalog alone. Stock is checked but not used up: every visitor shops the same demo store. */
export function createOrder(o: { items: { productId: string; color: string; size: string; qty: number }[]; name: string; zone: string }): ShopOrder {
  const items = Array.isArray(o?.items) ? o.items : [];
  if (items.length === 0) throw new ToolError("empty_order", "The order has no items.");
  if (items.length > MAX_LINES) throw new ToolError("bad_qty", `At most ${MAX_LINES} lines per order.`);

  const wanted = new Map<string, number>();
  let itemsCents = 0;
  const lines = items.map((it): OrderLine => {
    const p = getProduct(it?.productId);
    const color = colorOf(p, it.color);
    const size = it.size == null && p.sizes.length === 1 ? p.sizes[0] : sizeOf(p, it.size);
    const qty = it.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new ToolError("bad_qty", `Quantity must be a whole number from 1 to ${MAX_QTY}.`);

    const key = `${color.id}/${size}`;
    const total = (wanted.get(`${p.id}:${key}`) ?? 0) + qty;
    wanted.set(`${p.id}:${key}`, total);
    const have = p.stock[key] ?? 0;
    if (total > have) throw new ToolError("out_of_stock", `${p.name.en} in ${color.id} ${size}: only ${have} in stock.`);

    const unitCents = Math.round(p.price * 100);
    itemsCents += unitCents * qty;
    return { productId: p.id, name: p.name, color, size, qty, unitPrice: unitCents / 100, lineTotal: (unitCents * qty) / 100 };
  });

  const quote = quoteDelivery(o.zone);
  if ("error" in quote) throw new ToolError("unknown_zone", `We deliver to: ${quote.zones.join(", ")}.`);
  const deliveryCents = Math.round(quote.zone.price * 100);
  const name = String(o.name ?? "").trim().slice(0, 40) || T.guest.en;

  return { id: `MF-${++orderSeq}`, name, zone: quote.zone, lines, delivery: deliveryCents / 100, total: (itemsCents + deliveryCents) / 100 };
}
