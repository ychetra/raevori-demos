"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Building blocks shared by every owner admin (café, salon, queue): button and field styles, switch, sheet, field,
 * money stepper, segments, time select. They hold no copy of their own: each demo passes its labels from its km.ts.
 */

export const btnPrimary = "min-h-11 rounded-[12px] bg-fg px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50";
export const btnSecondary = "min-h-11 rounded-[12px] border border-line px-4 text-[14px] font-semibold transition-colors hover:border-line-strong disabled:opacity-50";
/** A destructive confirm (cancel an order or booking, reset). */
export const btnDanger = "min-h-11 rounded-[12px] bg-khqr px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50";
export const input =
  "min-h-11 w-full min-w-0 rounded-[12px] border border-line bg-surface px-3 text-[14.5px] outline-none transition-colors focus:border-fg aria-[invalid=true]:border-khqr";
export const card = "rounded-[20px] border border-line bg-surface";
/** A filter chip (status filters); `on` when pressed. */
export const chip = (on: boolean) =>
  `min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap ${on ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`;

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

/**
 * Money in fixed steps (25 or 50 cents): − $2.25 +. Typing works too; the server has the last word.
 * `less` and `more` are the buttons' accessible names.
 */
export function MoneyStepper({
  value,
  onChange,
  min,
  max,
  step,
  less,
  more,
  id,
  invalid,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  less: string;
  more: string;
  id?: string;
  invalid?: boolean;
  label?: string;
}) {
  const per = 1 / step;
  const snap = (v: number) => Math.round(v * per) / per;
  const nudge = (d: number) => onChange(Math.min(max, Math.max(min, snap(value + d))));
  return (
    <div className="inline-flex items-center rounded-[12px] border border-line bg-surface" aria-invalid={invalid}>
      <button type="button" aria-label={label ? `${label}: ${less}` : less} onClick={() => nudge(-step)} disabled={value <= min} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">−</button>
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
          onBlur={() => onChange(snap(value))}
          className="w-[52px] bg-transparent text-center outline-none"
        />
      </span>
      <button type="button" aria-label={label ? `${label}: ${more}` : more} onClick={() => nudge(step)} disabled={value >= max} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">+</button>
    </div>
  );
}

/**
 * A dialog: a bottom sheet on phones, a centred panel on wider screens. Focus moves in, Tab stays inside,
 * Escape closes, and focus returns to the opener afterwards. `closeLabel` names the close button.
 */
export function Sheet({ title, onClose, closeLabel, children, footer }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode; footer?: ReactNode }) {
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
      <button type="button" tabIndex={-1} aria-label={closeLabel} onClick={onClose} className="absolute inset-0 bg-[#141a15]/45 animate-[fade-in_.2s_ease-out]" />
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
          <button type="button" onClick={onClose} aria-label={closeLabel} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full hover:bg-paper">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}

/** A segmented choice (category, art kind, duration). */
export function Segments<V extends string | number>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
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

/** "HH:MM" on the half hour, from `from` (inclusive) for `count` steps: halfHours(0, 48) is 00:00 … 23:30. */
export function halfHours(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${String(Math.floor((from + i) / 2)).padStart(2, "0")}:${(from + i) % 2 ? "30" : "00"}`);
}

/** A native time picker in the field style. */
export function TimeSelect({ id, value, times, onChange, invalid, label }: { id: string; value: string; times: string[]; onChange: (v: string) => void; invalid: boolean; label?: string }) {
  return (
    <div className="relative">
      <select id={id} aria-label={label} className={`${input} appearance-none pr-9 tabular-nums`} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
        {times.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  );
}

/** The download link style with its arrow icon, e.g. "Download orders (Excel)". */
export function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} download className={`${btnSecondary} inline-flex items-center justify-center gap-2 whitespace-nowrap`}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
      {children}
    </a>
  );
}
