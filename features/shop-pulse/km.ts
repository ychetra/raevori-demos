import type { Text } from "@/lib/i18n";

/** Every Shop Pulse string, English and Khmer. Khmer needs the owner's native review. */
export const T = {
  cafe: { en: "Lotus Coffee", km: "Lotus Coffee" },
  /** Index with `weekday()`: 0 Sunday ... 6 Saturday. */
  weekdays: [
    { en: "Sun", km: "អាទិត្យ" },
    { en: "Mon", km: "ច័ន្ទ" },
    { en: "Tue", km: "អង្គារ" },
    { en: "Wed", km: "ពុធ" },
    { en: "Thu", km: "ព្រហស្បតិ៍" },
    { en: "Fri", km: "សុក្រ" },
    { en: "Sat", km: "សៅរ៍" },
  ],
  /** Index 0 January ... 11 December. */
  months: [
    { en: "Jan", km: "មករា" },
    { en: "Feb", km: "កុម្ភៈ" },
    { en: "Mar", km: "មីនា" },
    { en: "Apr", km: "មេសា" },
    { en: "May", km: "ឧសភា" },
    { en: "Jun", km: "មិថុនា" },
    { en: "Jul", km: "កក្កដា" },
    { en: "Aug", km: "សីហា" },
    { en: "Sep", km: "កញ្ញា" },
    { en: "Oct", km: "តុលា" },
    { en: "Nov", km: "វិច្ឆិកា" },
    { en: "Dec", km: "ធ្នូ" },
  ],
  ui: {
    salesToday: { en: "Sales today", km: "ការលក់ថ្ងៃនេះ" },
    orders: { en: "Orders", km: "ការកម្មង់" },
    avgOrder: { en: "Average order", km: "ការកម្មង់ជាមធ្យម" },
    khqrShare: { en: "KHQR share", km: "ចំណែក KHQR" },
    vsYesterday: { en: "vs same time yesterday", km: "ធៀបនឹងម៉ោងដដែលកាលពីម្សិលមិញ" },
    salesByHour: { en: "Sales by hour", km: "ការលក់តាមម៉ោង" },
    today: { en: "Today", km: "ថ្ងៃនេះ" },
    yesterday: { en: "Yesterday", km: "ម្សិលមិញ" },
    bestSellersToday: { en: "Best sellers today", km: "មុខលក់ដាច់ជាងគេថ្ងៃនេះ" },
    last14Days: { en: "Last 14 days", km: "១៤ ថ្ងៃចុងក្រោយ" },
    todaySoFar: { en: "Today so far", km: "ថ្ងៃនេះរហូតមកដល់ពេលនេះ" },
    liveOrders: { en: "Live orders", km: "ការកម្មង់ផ្ទាល់" },
    table: { en: "Table", km: "តុ" },
    cash: { en: "Cash", km: "សាច់ប្រាក់" },
    khqr: { en: "KHQR", km: "KHQR" },
  },
} satisfies Record<string, Text | Text[] | Record<string, Text>>;
