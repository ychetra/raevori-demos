"use client";

import { useEffect, useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { resetQueue, saveSettings, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { AutoCall, QueueSettings } from "../../types";
import { btnPrimary, btnSecondary, card, Field, input, Segments } from "./parts";

type Props = { room: string; settings: QueueSettings; lang: Lang; onFail: (f: AdminFail) => boolean };

const AUTO: { value: `${AutoCall}`; label: Text }[] = [
  { value: "0", label: T.admin.off },
  { value: "20", label: T.admin.every20 },
  { value: "60", label: T.admin.every60 },
];

/** Shop name, the board's auto-call interval, and the reset. */
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

  const set = (patch: Partial<QueueSettings>) => {
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
    setError({ field: r.field, text: r.field === "name" ? T.admin.errShopName : T.admin.errFailed });
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    const r = await resetQueue(room);
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

  const nameError = error?.field === "name" ? t(error.text) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-label={t(T.admin.tabs.settings)}>
        <Field label={t(T.admin.shopName)} htmlFor="shop-name" hint={t(T.admin.shopNameHint)} error={nameError}>
          <input id="shop-name" className={input} value={form.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!nameError} />
        </Field>

        <Field label={t(T.admin.autoCall)} hint={t(T.admin.autoCallHint)}>
          <Segments value={`${form.autoCall}` as `${AutoCall}`} onChange={(v) => set({ autoCall: Number(v) as AutoCall })} label={t(T.admin.autoCall)} options={AUTO.map((a) => ({ value: a.value, label: t(a.label) }))} />
        </Field>

        {error && error.field !== "name" && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
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
