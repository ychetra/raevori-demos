"use client";

import { useEffect, useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { MAX_TABLES } from "../../admin";
import { resetShop, saveSettings, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { ShopSettings } from "../../types";
import { btnPrimary, btnSecondary, card, Field, input, Switch } from "./parts";

type Props = { room: string; settings: ShopSettings; lang: Lang; onFail: (f: AdminFail) => boolean };

const half = (i: number) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
const OPEN_TIMES = Array.from({ length: 48 }, (_, i) => half(i)); // 00:00 … 23:30
const CLOSE_TIMES = Array.from({ length: 48 }, (_, i) => half(i + 1)); // 00:30 … 24:00
const isAllDay = (s: Pick<ShopSettings, "open" | "close">) => s.open === "00:00" && s.close === "24:00";
// Hours a café keeps, for when the owner turns "Open all day" off.
const DAY_HOURS = { open: "07:00", close: "21:00" };

/** Café name, tables, opening hours, and the reset. */
export function SettingsTab({ room, settings, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [form, setForm] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: Text } | null>(null);
  const [saved, setSaved] = useState<Text | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Live settings (another tab, a reset) replace the form unless the owner is mid-edit.
  useEffect(() => {
    if (!dirty) setForm(settings);
  }, [settings, dirty]);

  const set = (patch: Partial<ShopSettings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setSaved(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await saveSettings(room, { ...form, name: form.name.trim() });
    setBusy(false);
    if (r.ok) {
      setDirty(false);
      setForm(r.value);
      setSaved(T.admin.saved);
      return;
    }
    if (onFail(r)) return;
    const text = r.field === "name" ? T.admin.errSettingsName : r.field === "tables" ? T.admin.errTables : r.field === "open" || r.field === "close" ? T.admin.errHours : T.admin.errFailed;
    setError({ field: r.field, text });
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    const r = await resetShop(room);
    setBusy(false);
    setConfirmReset(false);
    if (r.ok) {
      setDirty(false);
      setForm(r.value.settings);
      setSaved(T.admin.resetDone);
      return;
    }
    if (!onFail(r)) setError({ text: T.admin.errFailed });
  };

  const err = (...fields: string[]) => (error?.field && fields.includes(error.field) ? t(error.text) : null);
  const allDay = isAllDay(form);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-label={t(T.admin.tabs.settings)}>
        <Field label={t(T.admin.cafeName)} htmlFor="cafe-name" hint={t(T.admin.cafeNameHint)} error={err("name")}>
          <input id="cafe-name" className={input} value={form.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!err("name")} />
        </Field>

        <Field label={t(T.admin.tables)} htmlFor="tables" error={err("tables")}>
          <div className="inline-flex w-fit items-center rounded-[12px] border border-line">
            <button type="button" aria-label={t(T.admin.fewer)} disabled={form.tables <= 1} onClick={() => set({ tables: Math.max(1, form.tables - 1) })} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">−</button>
            <input
              id="tables"
              inputMode="numeric"
              value={form.tables}
              onChange={(e) => set({ tables: Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10) })}
              className="w-12 bg-transparent text-center text-[14.5px] tabular-nums outline-none"
            />
            <button type="button" aria-label={t(T.admin.moreTables)} disabled={form.tables >= MAX_TABLES} onClick={() => set({ tables: Math.min(MAX_TABLES, form.tables + 1) })} className="grid size-11 place-items-center text-[18px] disabled:opacity-40">+</button>
          </div>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.5px] font-semibold text-muted">{t(T.admin.hours)}</legend>
          <div className="mt-1.5 rounded-[14px] border border-line px-3">
            <Switch on={allDay} onChange={(on) => set(on ? { open: "00:00", close: "24:00" } : DAY_HOURS)} label={t(T.admin.allDay)} />
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t(T.admin.opens)} htmlFor="opens">
                <TimeSelect id="opens" value={form.open} times={OPEN_TIMES} onChange={(open) => set({ open })} invalid={!!err("open")} />
              </Field>
              <Field label={t(T.admin.closes)} htmlFor="closes">
                <TimeSelect id="closes" value={form.close} times={CLOSE_TIMES} onChange={(close) => set({ close })} invalid={!!err("close")} />
              </Field>
            </div>
          )}
          {err("open", "close") ? <p role="alert" className="text-[12.5px] font-medium text-khqr">{err("open", "close")}</p> : <p className="text-[12px] text-muted">{t(T.admin.hoursHint)}</p>}
        </fieldset>

        {error && !error.field && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !dirty} className={btnPrimary}>{busy ? t(T.admin.saving) : t(T.admin.save)}</button>
          {dirty && <button type="button" onClick={() => { setDirty(false); setForm(settings); setError(null); }} className={btnSecondary}>{t(T.admin.cancel)}</button>}
          {saved && !dirty && <p role="status" className="text-[13px] text-muted">{t(saved)}</p>}
        </div>
      </section>

      <section className={`${card} p-4 sm:p-5`} aria-label={t(T.admin.reset)}>
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">{t(T.admin.reset)}</h3>
        <p className="mt-1 text-[13px] text-muted">{t(T.admin.resetHint)}</p>
        {confirmReset ? (
          <div className="mt-3 rounded-[14px] border border-line p-3">
            <p className="text-[13.5px] font-semibold">{t(T.admin.resetConfirm)}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button type="button" onClick={reset} disabled={busy} className="min-h-11 rounded-[12px] bg-khqr px-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">{t(T.admin.resetYes)}</button>
              <button type="button" onClick={() => setConfirmReset(false)} className={btnSecondary}>{t(T.admin.cancel)}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className={`${btnSecondary} mt-3`}>{t(T.admin.reset)}</button>
        )}
      </section>
    </div>
  );
}

function TimeSelect({ id, value, times, onChange, invalid }: { id: string; value: string; times: string[]; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <div className="relative">
      <select id={id} className={`${input} appearance-none pr-9 tabular-nums`} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
        {times.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  );
}
