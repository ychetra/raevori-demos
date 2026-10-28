"use client";

import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary, card, Field, halfHours, input, MoneyStepper, TimeSelect } from "@/components/admin/parts";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { resetSalon, saveSettings, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { SalonSettings } from "../../types";

type Props = { room: string; settings: SalonSettings; lang: Lang; onFail: (f: AdminFail) => boolean };

const OPEN_TIMES = halfHours(0, 48); // 00:00 … 23:30
const CLOSE_TIMES = halfHours(1, 48); // 00:30 … 24:00

/** Salon name, opening hours, the deposit, and the reset. */
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

  const set = (patch: Partial<SalonSettings>) => {
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
    const text = r.field === "name" ? T.admin.errSettingsName : r.field === "open" || r.field === "close" ? T.admin.errHours : r.field === "deposit" ? T.admin.errDeposit : T.admin.errFailed;
    setError({ field: r.field, text });
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    const r = await resetSalon(room);
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-label={t(T.admin.tabs.settings)}>
        <Field label={t(T.admin.salonName)} htmlFor="salon-name" hint={t(T.admin.salonNameHint)} error={err("name")}>
          <input id="salon-name" className={input} value={form.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!err("name")} />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.5px] font-semibold text-muted">{t(T.admin.hours)}</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2.5">
            <Field label={t(T.admin.opens)} htmlFor="opens">
              <TimeSelect id="opens" value={form.open} times={OPEN_TIMES} onChange={(open) => set({ open })} invalid={!!err("open")} />
            </Field>
            <Field label={t(T.admin.closes)} htmlFor="closes">
              <TimeSelect id="closes" value={form.close} times={CLOSE_TIMES} onChange={(close) => set({ close })} invalid={!!err("close")} />
            </Field>
          </div>
          {err("open", "close") ? <p role="alert" className="text-[12.5px] font-medium text-khqr">{err("open", "close")}</p> : <p className="text-[12px] text-muted">{t(T.admin.hoursHint)}</p>}
        </fieldset>

        <Field label={t(T.admin.deposit)} htmlFor="deposit" hint={t(T.admin.depositHint)} error={err("deposit")}>
          <div>
            <MoneyStepper id="deposit" label={t(T.admin.deposit)} value={form.deposit} onChange={(deposit) => set({ deposit })} min={0} max={10} step={0.5} less={t(T.admin.less)} more={t(T.admin.more)} invalid={!!err("deposit")} />
          </div>
        </Field>

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
