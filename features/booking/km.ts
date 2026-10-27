import type { Text } from "@/lib/i18n";
import type { ServiceId, StylistId } from "./types";

/** Every Booking string, English and Khmer. Khmer needs the owner's native review. Screen copy is added with the screens. */
export const T = {
  salon: { en: "Bopha Beauty", km: "Bopha Beauty" },
  services: {
    haircut: { en: "Haircut", km: "កាត់សក់" },
    wash: { en: "Hair wash and blow dry", km: "កក់សក់ និងផ្លុំសក់" },
    colour: { en: "Hair colour", km: "ជ្រលក់ពណ៌សក់" },
    manicure: { en: "Manicure", km: "ធ្វើក្រចកដៃ" },
    facial: { en: "Facial", km: "ថែរក្សាផ្ទៃមុខ" },
  } satisfies Record<ServiceId, Text>,
  stylists: {
    bopha: { en: "Bopha", km: "បុប្ផា" },
    dara: { en: "Dara", km: "ដារ៉ា" },
    "srey-leak": { en: "Srey Leak", km: "ស្រីលក្ខណ៍" },
  } satisfies Record<StylistId, Text>,
  anyone: { en: "Anyone", km: "នរណាក៏បាន" },
};
