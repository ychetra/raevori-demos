import type { Text } from "@/lib/i18n";

/** Every Table Order string, English and Khmer. Khmer needs the owner's native review. */
export const T = {
  cafe: { en: "Lotus Coffee", km: "Lotus Coffee" },
  tagline: { en: "Fresh Khmer coffee since 2019", km: "កាហ្វេខ្មែរស្រស់ៗ តាំងពីឆ្នាំ ២០១៩" },
  table: { en: "Table", km: "តុ" },
  cats: {
    coffee: { en: "Coffee", km: "កាហ្វេ" },
    tea: { en: "Tea", km: "តែ" },
    smoothie: { en: "Smoothies", km: "ក្រឡុក" },
    bakery: { en: "Bakery", km: "នំ" },
  },
  items: {
    "iced-khmer-coffee": { en: "Iced Khmer coffee", km: "កាហ្វេខ្មែរទឹកកក" },
    "iced-latte": { en: "Iced latte", km: "ឡាតេទឹកកក" },
    americano: { en: "Americano", km: "អាមេរិកាណូ" },
    cappuccino: { en: "Cappuccino", km: "កាពូឈីណូ" },
    "coconut-coffee": { en: "Coconut coffee", km: "កាហ្វេដូង" },
    "matcha-latte": { en: "Matcha latte", km: "ម៉ាចាឡាតេ" },
    "jasmine-tea": { en: "Jasmine tea", km: "តែម្លិះ" },
    "thai-tea": { en: "Thai milk tea", km: "តែថៃទឹកដោះគោ" },
    "lemon-tea": { en: "Iced lemon tea", km: "តែក្រូចឆ្មាទឹកកក" },
    "mango-smoothie": { en: "Mango smoothie", km: "ក្រឡុកស្វាយ" },
    "passion-smoothie": { en: "Passion fruit smoothie", km: "ក្រឡុកផ្លែសាវម៉ាវ" },
    "dragon-smoothie": { en: "Dragon fruit smoothie", km: "ក្រឡុកផ្លែស្រកានាគ" },
    "butter-croissant": { en: "Butter croissant", km: "នំក្រូសង់ប៊ឺ" },
    "banana-bread": { en: "Banana bread", km: "នំបុ័ងចេក" },
  },
  notes: {
    "iced-khmer-coffee": { en: "condensed milk", km: "ទឹកដោះគោខាប់" },
  },
  groups: {
    size: { en: "Size", km: "ទំហំ" },
    ice: { en: "Ice", km: "ទឹកកក" },
    sugar: { en: "Sugar", km: "ស្ករ" },
    warm: { en: "Warmed", km: "កំដៅ" },
  },
  choices: {
    regular: { en: "Regular", km: "ធម្មតា" },
    large: { en: "Large", km: "ធំ" },
    normal: { en: "Normal", km: "ធម្មតា" },
    less: { en: "Less", km: "តិច" },
    none: { en: "None", km: "គ្មាន" },
    yes: { en: "Warmed", km: "កំដៅ" },
    no: { en: "Not warmed", km: "មិនកំដៅ" },
  },
} satisfies Record<string, unknown>;

export const pct = (p: string): Text => ({ en: `${p}%`, km: `${p}%` });
