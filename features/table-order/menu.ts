import type { Text } from "@/lib/i18n";
import { pct, T } from "./km";
import type { MenuItem, OptionGroup } from "./types";

const size: OptionGroup = { id: "size", name: T.groups.size, default: "regular", choices: [
  { id: "regular", name: T.choices.regular, delta: 0 },
  { id: "large", name: T.choices.large, delta: 0.5 },
] };
const ice: OptionGroup = { id: "ice", name: T.groups.ice, default: "normal", choices: [
  { id: "normal", name: T.choices.normal, delta: 0 },
  { id: "less", name: T.choices.less, delta: 0 },
  { id: "none", name: T.choices.none, delta: 0 },
] };
const sugar: OptionGroup = { id: "sugar", name: T.groups.sugar, default: "100", choices: ["100", "70", "50", "0"].map((p) => ({ id: p, name: pct(p), delta: 0 })) };
const warm: OptionGroup = { id: "warm", name: T.groups.warm, default: "no", choices: [
  { id: "no", name: T.choices.no, delta: 0 },
  { id: "yes", name: T.choices.yes, delta: 0 },
] };

const iced = [size, ice, sugar];
const hot = [size, sugar];

type Id = keyof typeof T.items;
const item = (id: Id, cat: MenuItem["cat"], price: number, image: string, options: OptionGroup[], note?: Text): MenuItem =>
  ({ id, cat, name: T.items[id], price, image, options, ...(note && { note }) });

/** Lotus Coffee's menu. `image` is an illustration key: `cup:<fill colour>` or a pastry name. */
export const MENU: MenuItem[] = [
  item("iced-khmer-coffee", "coffee", 2.0, "cup:#8a5a36", iced, T.notes["iced-khmer-coffee"]),
  item("iced-latte", "coffee", 2.25, "cup:#b98557", iced),
  item("americano", "coffee", 1.75, "cup:#3b2a1e", iced),
  item("cappuccino", "coffee", 2.25, "mug:#c9a27c", hot),
  item("coconut-coffee", "coffee", 2.5, "cup:#d9c3a5", iced),
  item("matcha-latte", "tea", 2.75, "cup:#86a35d", iced),
  item("jasmine-tea", "tea", 1.5, "mug:#d8c37a", hot),
  item("thai-tea", "tea", 2.0, "cup:#d98b4a", iced),
  item("lemon-tea", "tea", 1.75, "cup:#e3b34c", iced),
  item("mango-smoothie", "smoothie", 2.75, "cup:#f2b33d", [size, sugar]),
  item("passion-smoothie", "smoothie", 2.5, "cup:#e6a23c", [size, sugar]),
  item("dragon-smoothie", "smoothie", 2.75, "cup:#d0457a", [size, sugar]),
  item("butter-croissant", "bakery", 2.0, "croissant", [warm]),
  item("banana-bread", "bakery", 1.75, "loaf", [warm]),
];

export const MENU_BY_ID = new Map(MENU.map((m) => [m.id, m]));
