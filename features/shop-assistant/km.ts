import type { Text } from "@/lib/i18n";

/** Every Shop Assistant string, English and Khmer. Khmer needs the owner's native review. */
export const T = {
  shop: { en: "Mealea Fashion", km: "Mealea Fashion" },
  products: {
    "linen-shirt": { en: "Linen shirt", km: "អាវក្រណាត់លីនិន" },
    "cotton-tee": { en: "Cotton T-shirt", km: "អាវយឺតកប្បាស" },
    "silk-blouse": { en: "Silk blouse", km: "អាវសូត្រនារី" },
    "denim-jacket": { en: "Denim jacket", km: "អាវក្រៅជីន" },
    "summer-dress": { en: "Floral summer dress", km: "រ៉ូបផ្កា" },
    "maxi-dress": { en: "Maxi dress", km: "រ៉ូបវែង" },
    "wrap-skirt": { en: "Wrap skirt", km: "សំពត់រុំ" },
    "wide-trousers": { en: "Wide-leg trousers", km: "ខោជើងធំ" },
    jeans: { en: "Slim jeans", km: "ខោជីន" },
    "linen-shorts": { en: "Linen shorts", km: "ខោខ្លីលីនិន" },
    "canvas-tote": { en: "Canvas tote bag", km: "កាបូបយួរក្រណាត់" },
    "leather-handbag": { en: "Leather handbag", km: "កាបូបដៃស្បែក" },
    "crossbody-bag": { en: "Mini crossbody bag", km: "កាបូបស្ពាយតូច" },
    backpack: { en: "Everyday backpack", km: "កាបូបស្ពាយក្រោយ" },
    sneakers: { en: "Canvas sneakers", km: "ស្បែកជើងប៉ាតា" },
    sandals: { en: "Leather sandals", km: "ស្បែកជើងសង្រែក" },
    heels: { en: "Block heels", km: "ស្បែកជើងកែង" },
    "krama-scarf": { en: "Silk krama scarf", km: "ក្រមាសូត្រ" },
    "sun-hat": { en: "Straw sun hat", km: "មួកចំបើង" },
    earrings: { en: "Silver earrings", km: "ក្រវិលប្រាក់" },
  },
  cats: {
    tops: { en: "Tops", km: "អាវ" },
    dresses: { en: "Dresses", km: "រ៉ូប" },
    bottoms: { en: "Trousers & skirts", km: "ខោ និងសំពត់" },
    bags: { en: "Bags", km: "កាបូប" },
    shoes: { en: "Shoes", km: "ស្បែកជើង" },
    accessories: { en: "Accessories", km: "គ្រឿងតុបតែង" },
  },
  /** Extra Khmer words customers use for a category (matched as substrings, Khmer has no spaces). */
  catWords: {
    tops: ["អាវ"],
    dresses: ["រ៉ូប", "រ្ញ៉ូប"],
    bottoms: ["ខោ", "សំពត់"],
    bags: ["កាបូប"],
    shoes: ["ស្បែកជើង", "ស្បែកជេីង"],
    accessories: ["ក្រមា", "មួក", "ក្រវិល", "គ្រឿងតុបតែង"],
  },
  colors: {
    black: { en: "Black", km: "ខ្មៅ" },
    white: { en: "White", km: "ស" },
    cream: { en: "Cream", km: "ក្រែម" },
    beige: { en: "Beige", km: "ត្នោតខ្ចី" },
    brown: { en: "Brown", km: "ត្នោត" },
    olive: { en: "Olive", km: "បៃតងចាស់" },
    green: { en: "Green", km: "បៃតង" },
    red: { en: "Red", km: "ក្រហម" },
    pink: { en: "Pink", km: "ផ្កាឈូក" },
    blue: { en: "Blue", km: "ខៀវ" },
    navy: { en: "Navy", km: "ខៀវចាស់" },
    silver: { en: "Silver", km: "ប្រាក់" },
  },
  /** How a colour is written inside a sentence. "ស" alone is too short to find safely, so it needs "ពណ៌". */
  colorWords: {
    white: ["ពណ៌ស", "សសុទ្ធ"],
  } as Record<string, string[]>,
  sizeWords: ["ទំហំ", "សាយ", "លេខ"],
  oneSize: { en: "One size", km: "ទំហំតែមួយ" },
  zones: {
    "toul-kork": { en: "Toul Kork", km: "ទួលគោក" },
    "daun-penh": { en: "Daun Penh", km: "ដូនពេញ" },
    "chamkar-mon": { en: "Chamkar Mon", km: "ចំការមន" },
    bkk: { en: "Boeung Keng Kang", km: "បឹងកេងកង" },
    "7-makara": { en: "7 Makara", km: "៧មករា" },
    "sen-sok": { en: "Sen Sok", km: "សែនសុខ" },
    "mean-chey": { en: "Mean Chey", km: "មានជ័យ" },
    "chbar-ampov": { en: "Chbar Ampov", km: "ច្បារអំពៅ" },
    "russey-keo": { en: "Russey Keo", km: "ឫស្សីកែវ" },
    "por-senchey": { en: "Por Senchey", km: "ពោធិ៍សែនជ័យ" },
  },
  guest: { en: "Guest", km: "ភ្ញៀវ" },
} satisfies Record<string, unknown>;

export type ProductId = keyof typeof T.products;
export type ColorId = keyof typeof T.colors;
export type CategoryId = keyof typeof T.cats;
export type ZoneId = keyof typeof T.zones;
export type { Text };
