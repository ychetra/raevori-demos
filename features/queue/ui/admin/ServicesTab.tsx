"use client";

import { useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { DEFAULT_MINUTES, MAX_SERVICES } from "../../admin";
import { addService, updateService, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { ServiceConfig } from "../../types";
import { btnPrimary, btnSecondary, card, Field, input, MinutesStepper, Sheet, Switch } from "./parts";

type Props = { room: string; services: ServiceConfig[]; lang: Lang; onFail: (f: AdminFail) => boolean };
type FormError = { field?: string; text: Text };

const FIELDS = ["name", "prefix", "minutes"];

/** The message for a failed service save, with the field it belongs to. */
function serviceError(f: AdminFail): FormError {
  if (f.error === "prefix_taken") return { field: "prefix", text: T.admin.errPrefixTaken };
  if (f.error === "too_many_services") return { text: T.admin.errTooMany };
  if (f.error === "invalid") {
    if (f.field === "name") return { field: "name", text: T.admin.errName };
    if (f.field === "prefix") return { field: "prefix", text: T.admin.errPrefix };
    if (f.field === "minutes") return { field: "minutes", text: T.admin.errMinutes };
  }
  return { text: T.admin.errFailed };
}

/** Each service with its letter, minutes and a Hide switch; tap a row to edit, or add one (up to 6). */
export function ServicesTab({ room, services, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // A switch flips at once; the config event confirms it a moment later.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const full = services.length >= MAX_SERVICES;

  const toggleHidden = async (s: ServiceConfig, hidden: boolean) => {
    setRowError(null);
    setPending((p) => ({ ...p, [s.id]: hidden }));
    const r = await updateService(room, { id: s.id, hidden });
    setPending(({ [s.id]: _, ...rest }) => rest);
    if (!r.ok && !onFail(r)) setRowError(s.id);
  };

  const current = editing ? services.find((s) => s.id === editing) : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted tabular-nums">
          {services.length} / {MAX_SERVICES}
          {full && <span> · {t(T.admin.servicesFull)}</span>}
        </p>
        <button type="button" onClick={() => setAdding(true)} disabled={full} className={`${btnPrimary} inline-flex shrink-0 items-center gap-1.5`}>
          <span aria-hidden="true" className="text-[18px] leading-none font-normal">+</span>
          {t(T.admin.addService)}
        </button>
      </div>

      <ul className={`${card} divide-y divide-line`}>
        {services.map((s) => {
          const hidden = pending[s.id] ?? !!s.hidden;
          return (
            <li key={s.id} data-admin-service={s.id} className="flex items-center gap-2 py-1.5 pr-3 pl-1.5">
              <button type="button" onClick={() => setEditing(s.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] p-1.5 text-left transition-colors hover:bg-paper/60">
                <span className={`grid size-12 shrink-0 place-items-center rounded-[12px] bg-paper text-[18px] font-bold ${hidden ? "text-muted" : ""}`}>{s.prefix}</span>
                <span className="min-w-0 flex-1">
                  <b className={`block truncate text-[14.5px] font-semibold ${hidden ? "text-muted" : ""}`}>{t(s.name)}</b>
                  <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                    <span className="tabular-nums">{s.minutes} {t(T.admin.perCustomer)}</span>
                    {hidden && <span className="rounded-full border border-line px-1.5 text-[11.5px] leading-[18px]">{t(T.admin.hidden)}</span>}
                  </span>
                  {rowError === s.id && <span role="alert" className="block text-[12px] text-khqr">{t(T.admin.errFailed)}</span>}
                </span>
              </button>
              <Switch compact on={hidden} onChange={(on) => toggleHidden(s, on)} label={t(T.admin.hide)} />
            </li>
          );
        })}
      </ul>

      {current && <ServiceSheet key={current.id} room={room} service={current} lang={lang} onFail={onFail} onClose={() => setEditing(null)} />}
      {adding && <ServiceSheet room={room} lang={lang} onFail={onFail} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Edit a service, or (without `service`) add one. */
function ServiceSheet({ room, service, lang, onFail, onClose }: { room: string; service?: ServiceConfig; lang: Lang; onFail: (f: AdminFail) => boolean; onClose: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [nameEn, setNameEn] = useState(service?.name.en ?? "");
  const [nameKm, setNameKm] = useState(service?.name.km ?? "");
  const [prefix, setPrefix] = useState(service?.prefix ?? "");
  const [minutes, setMinutes] = useState(service?.minutes ?? DEFAULT_MINUTES);
  const [hidden, setHidden] = useState(!!service?.hidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const name = { en: nameEn.trim(), km: nameKm.trim() || nameEn.trim() };
    const r = service
      ? await updateService(room, { id: service.id, name, prefix: prefix.trim(), minutes, hidden })
      : await addService(room, { name, prefix: prefix.trim(), minutes });
    setBusy(false);
    if (r.ok) return onClose();
    if (onFail(r)) return;
    setError(serviceError(r));
  };
  const err = (f: string) => (error?.field === f ? t(error.text) : null);

  return (
    <Sheet
      title={t(service ? T.admin.editService : T.admin.addService)}
      onClose={onClose}
      lang={lang}
      footer={
        <div className="flex flex-col gap-2">
          {error && !FIELDS.includes(error.field ?? "") && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>{t(T.admin.cancel)}</button>
            <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy ? t(T.admin.saving) : t(service ? T.admin.save : T.admin.addService)}</button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t(T.admin.nameEn)} htmlFor="svc-name-en" error={err("name")}>
          <input id="svc-name-en" className={input} value={nameEn} maxLength={40} onChange={(e) => setNameEn(e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field label={t(T.admin.nameKm)} htmlFor="svc-name-km" hint={t(T.admin.nameKmHint)}>
          <input id="svc-name-km" lang="km" className={input} value={nameKm} maxLength={40} onChange={(e) => setNameKm(e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field label={t(T.admin.letter)} htmlFor="svc-letter" hint={t(T.admin.letterHint)} error={err("prefix")}>
          <div className="w-16">
          <input
            id="svc-letter"
            className={`${input} text-center text-[17px] font-bold uppercase`}
            value={prefix}
            maxLength={1}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            aria-invalid={!!err("prefix")}
          />
          </div>
        </Field>
        <Field label={t(T.admin.minutes)} htmlFor="svc-minutes" hint={t(T.admin.minutesHint)} error={err("minutes")}>
          <div><MinutesStepper id="svc-minutes" label={t(T.admin.minutes)} value={minutes} onChange={setMinutes} lang={lang} invalid={!!err("minutes")} /></div>
        </Field>
        {service && (
          <div className="rounded-[14px] border border-line px-3">
            <Switch on={hidden} onChange={setHidden} label={t(T.admin.hideFromPhones)} hint={t(T.admin.hideHint)} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
