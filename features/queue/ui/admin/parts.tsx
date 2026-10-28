"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { pick, type Lang } from "@/lib/i18n";
import { T } from "../../km";

/**
 * The queue admin's building blocks. Styles, Switch, Field and Segments come from the café admin, so both admins look the same.
 * Sheet is a local copy (the café's labels its close button from the café's strings), and MinutesStepper is queue-only.
 */
export { btnPrimary, btnSecondary, card, Field, input, ppTime, Segments, Switch } from "@/features/table-order/ui/admin/parts";

/** Whole minutes 1-30: − 3 min +. Typing works too; the server has the last word. */
export function MinutesStepper({ value, onChange, lang, id, invalid, label }: { value: number; onChange: (v: number) => void; lang: Lang; id?: string; invalid?: boolean; label?: string }) {
  const step = (d: number) => onChange(Math.min(30, Math.max(1, value + d)));
  return (
    <div className="inline-flex items-center rounded-[12px] border border-line bg-surface" aria-invalid={invalid}>
      <button type="button" aria-label={pick(T.admin.fewerMin, lang)} onClick={() => step(-1)} disabled={value <= 1} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">−</button>
      <span className="flex items-center gap-1 text-[14.5px] tabular-nums">
        <input
          id={id}
          inputMode="numeric"
          aria-label={label}
          value={Number.isFinite(value) && value > 0 ? value : ""}
          onChange={(e) => onChange(Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10))}
          className="w-8 bg-transparent text-center outline-none"
        />
        <span className="pr-1 text-[13px] text-muted">{pick(T.admin.min, lang)}</span>
      </span>
      <button type="button" aria-label={pick(T.admin.moreMin, lang)} onClick={() => step(1)} disabled={value >= 30} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">+</button>
    </div>
  );
}

/**
 * A dialog: a bottom sheet on phones, a centred panel on wider screens. Focus moves in, Tab stays inside,
 * Escape closes, and focus returns to the opener afterwards. (Copy of the café admin's Sheet with the queue's strings.)
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
