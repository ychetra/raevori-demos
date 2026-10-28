"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { usd } from "@/lib/money";
import { T } from "../../km";

/** Small building blocks shared by the admin tabs: switch, sheet, field, stepper, button styles. */

export const btnPrimary = "min-h-11 rounded-[12px] bg-fg px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50";
export const btnSecondary = "min-h-11 rounded-[12px] border border-line px-4 text-[14px] font-semibold transition-colors hover:border-line-strong disabled:opacity-50";
export const input =
  "min-h-11 w-full min-w-0 rounded-[12px] border border-line bg-surface px-3 text-[14.5px] outline-none transition-colors focus:border-fg aria-[invalid=true]:border-khqr";
export const card = "rounded-[20px] border border-line bg-surface";

const PP_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit", hour12: false });
/** "14:05", Phnom Penh time. */
export const ppTime = (ms: number) => PP_TIME.format(ms);

/** On/off switch with its label; the track is the only colour, and the label says what it does. */
export function Switch({ on, onChange, label, hint, disabled, compact = false }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string; disabled?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex min-h-11 items-center gap-2.5 text-left disabled:opacity-60 ${compact ? "shrink-0" : "w-full"}`}
    >
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium">{label}</span>
          {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
        </span>
      )}
      {compact && <span className={`text-[12.5px] whitespace-nowrap ${on ? "font-semibold text-fg" : "text-muted"}`}>{label}</span>}
      <span aria-hidden="true" className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${on ? "bg-fg" : "bg-line-strong"}`}>
        <span className={`absolute top-[3px] left-[3px] size-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[18px]" : ""}`} />
      </span>
    </button>
  );
}

/** A labelled field with its error underneath. */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-muted">{label}</label>
      {children}
      {hint && !error && <p className="text-[12px] text-muted">{hint}</p>}
      {error && <p role="alert" className="text-[12.5px] font-medium text-khqr">{error}</p>}
    </div>
  );
}

/** Money in 25-cent steps: − $2.25 +. Typing works too; the server has the last word. */
export function MoneyStepper({ value, onChange, min, lang, id, invalid, label }: { value: number; onChange: (v: number) => void; min: number; lang: Lang; id?: string; invalid?: boolean; label?: string }) {
  const step = (d: number) => onChange(Math.min(100, Math.max(min, Math.round((value + d) * 4) / 4)));
  return (
    <div className="inline-flex items-center rounded-[12px] border border-line bg-surface" aria-invalid={invalid}>
      <button type="button" aria-label={label ? `${label}: ${pick(T.admin.less, lang)}` : pick(T.admin.less, lang)} onClick={() => step(-0.25)} disabled={value <= min} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">−</button>
      <span className="flex items-center text-[14.5px] tabular-nums">
        $
        <input
          id={id}
          inputMode="decimal"
          aria-label={label}
          value={Number.isFinite(value) ? value.toFixed(2) : ""}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
            onChange(Number.isFinite(n) ? n : 0);
          }}
          onBlur={() => onChange(Math.round(value * 4) / 4)}
          className="w-[52px] bg-transparent text-center outline-none"
        />
      </span>
      <button type="button" aria-label={label ? `${label}: ${pick(T.admin.more, lang)}` : pick(T.admin.more, lang)} onClick={() => step(0.25)} disabled={value >= 100} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">+</button>
    </div>
  );
}

export const plusUsd = (n: number) => (n > 0 ? `+${usd(n)}` : usd(0));

/**
 * A dialog: a bottom sheet on phones, a centred panel on wider screens. Focus moves in, Tab stays inside,
 * Escape closes, and focus returns to the opener afterwards.
 */
export function Sheet({ title, onClose, lang, children, footer }: { title: string; onClose: () => void; lang: Lang; children: ReactNode; footer?: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  // Escape is heard on the window: a button inside that just went away (e.g. "Keep order") leaves focus on <body>.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      const els = dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea, a[href], summary");
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6" onKeyDown={onKeyDown}>
      <button type="button" tabIndex={-1} aria-label={pick(T.admin.close, lang)} onClick={onClose} className="absolute inset-0 bg-[#141a15]/45 animate-[fade-in_.2s_ease-out]" />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[24px] bg-surface outline-none animate-[sheet-in_.35s_var(--ease-out-expo)] sm:max-h-[86dvh] sm:max-w-[520px] sm:rounded-[24px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 pt-3.5 pb-3 sm:px-5">
          <h2 id={titleId} className="min-w-0 text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
          <button type="button" onClick={onClose} aria-label={pick(T.admin.close, lang)} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full hover:bg-paper">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}

/** A segmented choice (category, art kind). */
export function Segments<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-[10px] border px-3 text-[13.5px] transition-colors ${value === o.value ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
