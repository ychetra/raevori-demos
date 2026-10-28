"use client";

import { MoneyStepper as Stepper } from "@/components/admin/parts";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { usd } from "@/lib/money";
import { T } from "../../km";

/** The café admin's own bits; the shared switch, sheet, field and styles live in components/admin/parts. */

const PP_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit", hour12: false });
/** "14:05", Phnom Penh time. */
export const ppTime = (ms: number) => PP_TIME.format(ms);

/** Money in 25-cent steps up to $100: − $2.25 +. */
export function MoneyStepper({ value, onChange, min, lang, id, invalid, label }: { value: number; onChange: (v: number) => void; min: number; lang: Lang; id?: string; invalid?: boolean; label?: string }) {
  return <Stepper value={value} onChange={onChange} min={min} max={100} step={0.25} less={pick(T.admin.less, lang)} more={pick(T.admin.more, lang)} id={id} invalid={invalid} label={label} />;
}

export const plusUsd = (n: number) => (n > 0 ? `+${usd(n)}` : usd(0));

/** The message for an API `field`, in the menu forms. */
export function itemFieldError(field: string | undefined): Text {
  switch (field) {
    case "name":
      return T.admin.errName;
    case "note":
      return T.admin.errNote;
    case "price":
      return T.admin.errPrice;
    case "cat":
      return T.admin.errCat;
    case "image":
      return T.admin.errImage;
    case "options":
      return T.admin.errOptions;
    default:
      return T.admin.errFailed;
  }
}
