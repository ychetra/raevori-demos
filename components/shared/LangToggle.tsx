"use client";

import type { Lang } from "@/lib/i18n";

/** EN / ខ្មែរ segmented switch. `tone="glass"` sits on coloured headers, `tone="paper"` on light surfaces. */
export function LangToggle({ lang, onChange, tone = "paper" }: { lang: Lang; onChange: (l: Lang) => void; tone?: "glass" | "paper" }) {
  const track = tone === "glass" ? "bg-white/18" : "bg-paper";
  const idle = tone === "glass" ? "text-white/85" : "text-muted";
  return (
    <div role="group" aria-label="Language" className={`inline-flex rounded-full p-[3px] ${track}`}>
      {(["en", "km"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          lang={l === "km" ? "km" : undefined}
          className={`min-h-7 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors ${lang === l ? "bg-white text-fg shadow-sm" : idle}`}
        >
          {l === "en" ? "EN" : "ខ្មែរ"}
        </button>
      ))}
    </div>
  );
}
