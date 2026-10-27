import type { Lang } from "@/lib/i18n";
import { T } from "./km";

const choice = (id: string, lang: Lang) => (T.choices as Record<string, { en: string; km: string }>)[id]?.[lang] ?? id;

/** Short option line for tickets and the cart, e.g. "Large · Less ice · 50% sugar". Plain sugar and unwarmed pastries are left out. */
export function optionSummary(options: Record<string, string>, lang: Lang): string {
  const parts: string[] = [];
  if (options.size) parts.push(choice(options.size, lang));
  if (options.ice) parts.push(lang === "km" ? (options.ice === "none" ? "គ្មានទឹកកក" : `ទឹកកក${choice(options.ice, lang)}`) : `${choice(options.ice, lang)} ice`);
  if (options.sugar && options.sugar !== "100") parts.push(lang === "km" ? `ស្ករ ${options.sugar}%` : `${options.sugar}% sugar`);
  if (options.warm === "yes") parts.push(choice("yes", lang));
  return parts.join(" · ");
}

export function ageLabel(ms: number): string {
  if (ms < 45_000) return "just now";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
