"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { pick, type Lang } from "@/lib/i18n";
import { khr, usd } from "@/lib/money";
import { T } from "../km";
import type { CartLine, MenuItem } from "../types";
import { artTile, MenuArt } from "./MenuArt";

/** Bottom sheet for choosing options and quantity before adding an item to the cart. */
export function ItemSheet({ item, lang, onAdd, onClose }: { item: MenuItem; lang: Lang; onAdd: (line: CartLine) => void; onClose: () => void }) {
  const [options, setOptions] = useState<Record<string, string>>(() => Object.fromEntries(item.options.map((g) => [g.id, g.default])));
  const [qty, setQty] = useState(1);
  const dialog = useRef<HTMLDivElement>(null);
  const unit = item.price + item.options.reduce((s, g) => s + (g.choices.find((c) => c.id === options[g.id])?.delta ?? 0), 0);

  // Keyboard: focus moves into the sheet, Tab stays inside it, Escape closes it, and focus returns to the item afterwards.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      const els = dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!els?.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" onKeyDown={onKeyDown}>
      <button type="button" tabIndex={-1} aria-label={pick(T.ui.close, lang)} onClick={onClose} className="absolute inset-0 bg-[#141a15]/45 animate-[fade-in_.2s_ease-out]" />
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={pick(item.name, lang)} className="relative outline-none max-h-[88%] overflow-y-auto rounded-t-[24px] bg-surface px-4 pt-3.5 pb-4 animate-[sheet-in_.35s_var(--ease-out-expo)]">
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-line-strong" />
        <div className="flex items-center gap-3">
          <span className="grid size-16 shrink-0 place-items-center rounded-[16px]" style={{ background: artTile(item.image) }}>
            <MenuArt image={item.image} className="h-10 w-9" />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{pick(item.name, lang)}</h2>
            <p className="text-[13px] text-muted tabular-nums">{usd(item.price)} · {khr(item.price)}៛</p>
          </div>
        </div>

        {item.options.map((g) => (
          <fieldset key={g.id} className="mt-4">
            <legend className="text-[12px] font-semibold text-muted">{pick(g.name, lang)}</legend>
            <div role="radiogroup" className="mt-1.5 flex flex-wrap gap-1.5">
              {g.choices.map((c) => {
                const on = options[g.id] === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOptions((o) => ({ ...o, [g.id]: c.id }))}
                    className={`min-h-10 rounded-[10px] border px-3 text-[13px] transition-colors ${on ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
                  >
                    {pick(c.name, lang)}
                    {c.delta > 0 && ` +${usd(c.delta)}`}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className="mt-5 flex items-center gap-2.5">
          <div className="flex items-center rounded-[14px] border border-line">
            <button type="button" aria-label="−" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-11 place-items-center text-[18px]">−</button>
            <b className="w-6 text-center tabular-nums" aria-live="polite">{qty}</b>
            <button type="button" aria-label="+" onClick={() => setQty((q) => Math.min(20, q + 1))} className="grid size-11 place-items-center text-[18px]">+</button>
          </div>
          <button
            type="button"
            onClick={() => onAdd({ itemId: item.id, qty, options })}
            className="min-h-12 flex-1 rounded-[14px] bg-fg px-4 text-[14px] font-semibold text-white hover:opacity-90"
          >
            {pick(T.ui.add, lang)} · {usd(unit * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}
