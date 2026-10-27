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
  /** Khmer chat bubbles in the Shop Assistant card on the home page. */
  home: {
    ask: "អាវនេះមានពណ៌ខ្មៅទេ?",
    answer: "មាន! ទំហំ M នៅមានក្នុងស្តុក។",
  },
  /** The sample chat: replayed when the live assistant is busy, and played by the fake model in tests. */
  replay: {
    u1: { en: "Do you have this shirt in black, size M?", km: "អាវនេះមានពណ៌ខ្មៅទេ? ទំហំ M" },
    a1: { en: "Yes! The linen shirt in black, size M is in stock for $18.00. Would you like it delivered?", km: "មាន! អាវក្រណាត់លីនិន ពណ៌ខ្មៅ ទំហំ M នៅមានក្នុងស្តុក តម្លៃ $18.00។ ចង់ឱ្យយើងដឹកជូនទេ?" },
    u2: { en: "Can you deliver to Toul Kork today?", km: "ដឹកទៅទួលគោកថ្ងៃនេះបានទេ?" },
    a2: { en: "Yes, delivery to Toul Kork is $1.50 and arrives this afternoon. Shall I place the order? Any name is fine, this is a demo.", km: "បាន! ដឹកទៅទួលគោកថ្លៃ $1.50 ហើយដល់រសៀលនេះ។ ឱ្យខ្ញុំកម្មង់ជូនទេ? ដាក់ឈ្មោះអ្វីក៏បាន ព្រោះនេះជាការសាកល្បង។" },
    u3: { en: "Yes please. My name is Dara.", km: "បាទ កម្មង់ទៅ។ ខ្ញុំឈ្មោះ ដារ៉ា។" },
    a3: { en: "Done! Pay with KHQR below and we'll send it out today.", km: "រួចរាល់! សូមបង់តាម KHQR ខាងក្រោម យើងនឹងដឹកជូនថ្ងៃនេះ។" },
    end: { en: "That's the end of this sample chat. Want an assistant like this for your shop? Talk to Raevori.", km: "នេះជាចុងបញ្ចប់នៃការជជែកគំរូ។ ចង់បានជំនួយការបែបនេះសម្រាប់ហាងរបស់អ្នកទេ? ទាក់ទង Raevori។" },
  },
  suggestions: [
    { en: "Do you have this shirt in black, size M?", km: "អាវនេះមានពណ៌ខ្មៅទេ? ទំហំ M" },
    { en: "Any red bags under $25?", km: "តើមានកាបូបពណ៌ក្រហមទេ?" },
    { en: "How much is delivery to Sen Sok?", km: "ដឹកទៅសែនសុខថ្លៃប៉ុន្មាន?" },
  ],
  ui: {
    subtitle: { en: "AI assistant · replies instantly", km: "ជំនួយការ AI · ឆ្លើយតបភ្លាមៗ" },
    greeting: { en: "Hi! I'm Mealea Fashion's assistant. Ask me about clothes, sizes, stock or delivery, in Khmer or English.", km: "សួស្តី! ខ្ញុំជាជំនួយការរបស់ Mealea Fashion។ សួរខ្ញុំពីសម្លៀកបំពាក់ ទំហំ ស្តុក ឬការដឹកជញ្ជូន ជាភាសាខ្មែរ ឬអង់គ្លេសក៏បាន។" },
    tryAsking: { en: "Try asking", km: "សាកសួរ" },
    placeholder: { en: "Message Mealea Fashion…", km: "សរសេរសារទៅ Mealea Fashion…" },
    send: { en: "Send", km: "ផ្ញើ" },
    footnote: { en: "Demo · Don't share personal information", km: "សាកល្បង · សូមកុំចែករំលែកព័ត៌មានផ្ទាល់ខ្លួន" },
    checking: { en: "Checking stock…", km: "កំពុងពិនិត្យស្តុក…" },
    sample: { en: "Sample chat", km: "ការជជែកគំរូ" },
    busyTitle: { en: "The demo is busy right now", km: "ការសាកល្បងកំពុងរវល់" },
    watch: { en: "Watch a sample chat", km: "មើលការជជែកគំរូ" },
    wantOne: { en: "Want one for your shop?", km: "ចង់បានមួយសម្រាប់ហាងរបស់អ្នក?" },
    talk: { en: "Talk to Raevori", km: "ទាក់ទង Raevori" },
    delivery: { en: "Delivery", km: "ដឹកជញ្ជូន" },
    sameDay: { en: "Arrives today", km: "ដល់ថ្ងៃនេះ" },
    nextDay: { en: "Arrives tomorrow", km: "ដល់ថ្ងៃស្អែក" },
    total: { en: "Total", km: "សរុប" },
    order: { en: "Order", km: "ការកម្មង់" },
    payKhqr: { en: "Pay with KHQR", km: "បង់តាម KHQR" },
    paid: { en: "Paid. Mealea Fashion is packing your order.", km: "បានបង់ហើយ។ Mealea Fashion កំពុងរៀបចំការកម្មង់របស់អ្នក។" },
    close: { en: "Close", km: "បិទ" },
  },
  reasons: {
    busy: { en: "The AI didn't answer in time. Watch a real sample chat instead.", km: "AI មិនបានឆ្លើយទាន់ពេលទេ។ មើលការជជែកគំរូជំនួសវិញ។" },
    global: { en: "Today's free AI limit is used up. Watch a real sample chat instead.", km: "ដែនកំណត់ AI ឥតគិតថ្លៃសម្រាប់ថ្ងៃនេះអស់ហើយ។ មើលការជជែកគំរូជំនួសវិញ។" },
    session: { en: "You've used this demo's 20 messages. Watch a real sample chat instead.", km: "អ្នកបានប្រើសារទាំង ២០ របស់ការសាកល្បងនេះអស់ហើយ។ មើលការជជែកគំរូជំនួសវិញ។" },
    ip: { en: "This network has used today's demo messages. Watch a real sample chat instead.", km: "បណ្តាញនេះបានប្រើសារសាកល្បងសម្រាប់ថ្ងៃនេះអស់ហើយ។ មើលការជជែកគំរូជំនួសវិញ។" },
    length: { en: "That message is too long. Keep it under 300 characters.", km: "សារនេះវែងពេក។ សូមសរសេរក្រោម ៣០០ តួអក្សរ។" },
  },
} satisfies Record<string, unknown>;

export type ProductId = keyof typeof T.products;
export type ColorId = keyof typeof T.colors;
export type CategoryId = keyof typeof T.cats;
export type ZoneId = keyof typeof T.zones;
export type { Text };
