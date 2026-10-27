import type { Text } from "@/lib/i18n";
import type { Service } from "./types";

/** Every Smart Queue string, English and Khmer. Khmer needs the owner's native review. Screen copy is added with the screens. */
export const T = {
  shop: { en: "Sokha Phone Repair", km: "Sokha Phone Repair" },
  services: {
    repair: { en: "Repair", km: "ជួសជុល" },
    pickup: { en: "Pick up", km: "មកយក" },
    payment: { en: "Payment", km: "បង់ប្រាក់" },
  } satisfies Record<Service, Text>,
  counter: { en: "Counter", km: "បញ្ជរ" },
};
