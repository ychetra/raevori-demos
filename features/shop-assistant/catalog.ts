import type { Text } from "@/lib/i18n";
import { T, type CategoryId, type ColorId, type ProductId, type ZoneId } from "./km";

export type Color = { id: ColorId; name: Text; hex: string };
/** `image` is an illustration key (shirt, dress, bag…), drawn in the selected colour. Stock key is `${color}/${size}`. */
export type Product = { id: ProductId; name: Text; category: CategoryId; colors: Color[]; sizes: string[]; price: number; image: string; stock: Record<string, number> };
export type Zone = { id: ZoneId; name: Text; price: number; sameDay: boolean };

export const ONE_SIZE = "One size";

const HEX: Record<ColorId, string> = {
  black: "#1d1f1d", white: "#f7f6f2", cream: "#ece6d8", beige: "#cdb894", brown: "#7a5236", olive: "#7f8f6a",
  green: "#3f7a4f", red: "#c2353b", pink: "#e6a5b4", blue: "#4f78a8", navy: "#24324f", silver: "#c4c7c9",
};
export const COLORS: Color[] = (Object.keys(T.colors) as ColorId[]).map((id) => ({ id, name: T.colors[id], hex: HEX[id] }));
const COLOR_BY_ID = new Map(COLORS.map((c) => [c.id, c]));

const TOPS = ["S", "M", "L", "XL"];
const SML = ["S", "M", "L"];
const ONE = [ONE_SIZE];

/** Combinations that are sold out, so the demo can show "out of stock" honestly. */
const SOLD_OUT = new Set(["linen-shirt:cream/XL", "summer-dress:red/S", "sneakers:white/42", "leather-handbag:brown/One size", "jeans:black/28"]);

let seq = 0;
function product(id: ProductId, category: CategoryId, price: number, image: string, colors: ColorId[], sizes: string[]): Product {
  const n = seq++;
  const stock: Record<string, number> = {};
  colors.forEach((c, ci) => sizes.forEach((s, si) => {
    const key = `${c}/${s}`;
    stock[key] = SOLD_OUT.has(`${id}:${key}`) ? 0 : 1 + ((n * 5 + ci * 3 + si * 7) % 6);
  }));
  return { id, name: T.products[id], category, colors: colors.map((c) => COLOR_BY_ID.get(c)!), sizes, price, image, stock };
}

/** Mealea Fashion's catalog: the only source of product facts the assistant may use. */
export const CATALOG: Product[] = [
  product("linen-shirt", "tops", 18, "shirt", ["black", "cream", "olive"], TOPS),
  product("cotton-tee", "tops", 8, "tee", ["black", "white", "navy"], TOPS),
  product("silk-blouse", "tops", 22, "blouse", ["cream", "pink", "navy"], SML),
  product("denim-jacket", "tops", 32, "jacket", ["blue", "black"], TOPS),
  product("summer-dress", "dresses", 24, "dress", ["red", "cream", "blue"], SML),
  product("maxi-dress", "dresses", 28, "maxi", ["black", "olive"], SML),
  product("wrap-skirt", "bottoms", 16, "skirt", ["black", "beige", "red"], SML),
  product("wide-trousers", "bottoms", 20, "trousers", ["black", "beige", "olive"], TOPS),
  product("jeans", "bottoms", 25, "jeans", ["blue", "black"], ["28", "30", "32", "34"]),
  product("linen-shorts", "bottoms", 12, "shorts", ["beige", "olive", "black"], SML),
  product("canvas-tote", "bags", 14, "tote", ["cream", "black", "red"], ONE),
  product("leather-handbag", "bags", 35, "handbag", ["red", "brown", "black"], ONE),
  product("crossbody-bag", "bags", 19, "crossbody", ["red", "black", "beige"], ONE),
  product("backpack", "bags", 26, "backpack", ["black", "navy"], ONE),
  product("sneakers", "shoes", 30, "sneaker", ["white", "black"], ["36", "37", "38", "39", "40", "41", "42"]),
  product("sandals", "shoes", 15, "sandal", ["brown", "black"], ["36", "37", "38", "39", "40", "41"]),
  product("heels", "shoes", 27, "heel", ["black", "red", "beige"], ["36", "37", "38", "39", "40"]),
  product("krama-scarf", "accessories", 12, "scarf", ["red", "blue", "green"], ONE),
  product("sun-hat", "accessories", 10, "hat", ["beige"], ONE),
  product("earrings", "accessories", 9, "earrings", ["silver"], ONE),
];

export const PRODUCT_BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

/** English words customers use for each category. */
export const CATEGORY_WORDS: Record<CategoryId, string[]> = {
  tops: ["top", "shirt", "tshirt", "t-shirt", "tee", "blouse", "jacket"],
  dresses: ["dress", "gown"],
  bottoms: ["trousers", "pants", "jeans", "skirt", "shorts", "bottom"],
  bags: ["bag", "handbag", "tote", "backpack", "purse"],
  shoes: ["shoe", "sneaker", "sandal", "heel", "footwear"],
  accessories: ["accessory", "accessories", "scarf", "krama", "hat", "earring", "earrings", "jewelry", "jewellery"],
};

/** Phnom Penh delivery zones with fixed prices. */
export const ZONES: Zone[] = ([
  ["toul-kork", 1.5, true], ["daun-penh", 1.5, true], ["chamkar-mon", 1.5, true], ["bkk", 1.5, true], ["7-makara", 1.5, true],
  ["sen-sok", 2, true], ["mean-chey", 2, true], ["chbar-ampov", 2, true], ["russey-keo", 2, true], ["por-senchey", 2.5, false],
] as const).map(([id, price, sameDay]) => ({ id, name: T.zones[id], price, sameDay }));

/** Other spellings customers type for a zone. */
export const ZONE_ALIASES: Partial<Record<ZoneId, string[]>> = {
  "toul-kork": ["tuol kork", "tuol kouk", "tk"],
  "chamkar-mon": ["chamkarmon"],
  bkk: ["bkk1", "bkk 1", "boeng keng kang", "beung keng kang"],
  "7-makara": ["prampir makara"],
  "sen-sok": ["sensok"],
  "por-senchey": ["pur senchey", "posenchey"],
};
