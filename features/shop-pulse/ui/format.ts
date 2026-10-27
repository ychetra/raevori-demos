import { pick, type Lang } from "@/lib/i18n";
import { T } from "../km";
import { PP_OFFSET_MS } from "../time";

/** Shifted so the UTC fields read as Phnom Penh wall-clock time. */
const local = (ms: number) => new Date(ms + PP_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, "0");

/** "14:32", Phnom Penh, 24 h. */
export function hhmm(ms: number): string {
  const d = local(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Wed 28 Oct" / "ពុធ 28 តុលា", Phnom Penh. */
export function dayLabel(ms: number, lang: Lang): string {
  const d = local(ms);
  return `${pick(T.weekdays[d.getUTCDay()], lang)} ${d.getUTCDate()} ${pick(T.months[d.getUTCMonth()], lang)}`;
}

/** Day of the month, Phnom Penh. */
export const dayOfMonth = (ms: number): number => local(ms).getUTCDate();

/** 0.81 → "81%". */
export const pct = (f: number) => `${Math.round(f * 100)}%`;

/** A change fraction as "▲ 12%" / "▼ 5%" ("0%" when it rounds to nothing); null stays null. */
export function changeLabel(c: number | null): string | null {
  if (c === null) return null;
  const p = Math.round(Math.abs(c) * 100);
  if (p === 0) return "0%";
  return `${c > 0 ? "▲" : "▼"} ${p}%`;
}
