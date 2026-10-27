import type { Text } from "@/lib/i18n";

/** Shared UI strings. Khmer needs the owner's native review. */
export const SHARED = {
  simulate: { en: "Simulate payment", km: "សាកល្បងបង់ប្រាក់" },
  demoNote: { en: "Demo, no money moves", km: "សាកល្បងប៉ុណ្ណោះ គ្មានការផ្ទេរប្រាក់ពិតទេ" },
  scanLabel: { en: "KHQR code for", km: "កូដ KHQR សម្រាប់" },
} satisfies Record<string, Text>;
